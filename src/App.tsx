import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCats } from "./api/cats";

type CatItem = {
  id: string;
  imageUrl: string;
};

const FAVORITES_STORAGE_KEY = "favorite-cat-ids";
const FAVORITE_CATS_STORAGE_KEY = "favorite-cats-by-id";
const INITIAL_CATS_BATCH_SIZE = 10;
const NEXT_CATS_BATCH_SIZE = 10;
const LOAD_MORE_OFFSET_PX = 480;
const SKELETON_ITEMS_COUNT = 10;

type TabKey = "all" | "favorites";

const readFavoriteIds = (): string[] => {
  const rawValue = localStorage.getItem(FAVORITES_STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);

    if (Array.isArray(parsedValue)) {
      return parsedValue.filter((id): id is string => typeof id === "string");
    }
  } catch {
    return [];
  }

  return [];
};

const readFavoriteCatsById = (): Record<string, CatItem> => {
  const rawValue = localStorage.getItem(FAVORITE_CATS_STORAGE_KEY);

  if (!rawValue) {
    return {};
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);

    if (!parsedValue || typeof parsedValue !== "object") {
      return {};
    }

    const entries = Object.entries(parsedValue);
    const result: Record<string, CatItem> = {};

    for (const [id, value] of entries) {
      if (!value || typeof value !== "object") {
        continue;
      }

      const imageUrl = "imageUrl" in value ? value.imageUrl : null;

      if (typeof imageUrl === "string") {
        result[id] = { id, imageUrl };
      }
    }

    return result;
  } catch {
    return {};
  }
};

export const App = () => {
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [allCats, setAllCats] = useState<CatItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(readFavoriteIds);
  const [favoriteCatsById, setFavoriteCatsById] = useState<Record<string, CatItem>>(
    readFavoriteCatsById
  );
  const favoriteIdsSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const isRequestInFlightRef = useRef(false);

  const loadCatsBatch = useCallback(async (batchSize: number, isFirstLoad = false) => {
    if (isRequestInFlightRef.current) {
      return;
    }

    isRequestInFlightRef.current = true;

    if (isFirstLoad) {
      setIsLoading(true);
      setLoadError(null);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const loadedCats = await fetchCats(batchSize);
      const mappedCats = loadedCats.map((cat) => ({ id: cat.id, imageUrl: cat.url }));

      setAllCats((currentCats) => {
        if (mappedCats.length === 0) {
          return currentCats;
        }

        const existingIds = new Set(currentCats.map((cat) => cat.id));
        const uniqueIncoming = mappedCats.filter((cat) => !existingIds.has(cat.id));

        return uniqueIncoming.length > 0 ? [...currentCats, ...uniqueIncoming] : currentCats;
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      if (isFirstLoad) {
        setIsLoading(false);
      } else {
        setIsLoadingMore(false);
      }

      isRequestInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const startLoading = async () => {
      await loadCatsBatch(INITIAL_CATS_BATCH_SIZE, true);
      void loadCatsBatch(NEXT_CATS_BATCH_SIZE);
    };

    void startLoading();
  }, [loadCatsBatch]);

  useEffect(() => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  useEffect(() => {
    localStorage.setItem(FAVORITE_CATS_STORAGE_KEY, JSON.stringify(favoriteCatsById));
  }, [favoriteCatsById]);

  const toggleFavorite = (cat: CatItem) => {
    const catId = cat.id;
    const isActive = favoriteIdsSet.has(catId);

    if (isActive) {
      setFavoriteIds((currentIds) => currentIds.filter((id) => id !== catId));
      setFavoriteCatsById((currentItems) => {
        const nextItems = { ...currentItems };
        delete nextItems[catId];
        return nextItems;
      });
      return;
    }

    setFavoriteIds((currentIds) => [...currentIds, catId]);
    setFavoriteCatsById((currentItems) => ({
      ...currentItems,
      [catId]: cat
    }));
  };

  useEffect(() => {
    if (allCats.length === 0 || favoriteIds.length === 0) {
      return;
    }

    setFavoriteCatsById((currentItems) => {
      const nextItems = { ...currentItems };
      let hasUpdates = false;

      for (const cat of allCats) {
        if (!favoriteIdsSet.has(cat.id)) {
          continue;
        }

        const savedItem = nextItems[cat.id];

        if (!savedItem || savedItem.imageUrl !== cat.imageUrl) {
          nextItems[cat.id] = cat;
          hasUpdates = true;
        }
      }

      return hasUpdates ? nextItems : currentItems;
    });
  }, [allCats, favoriteIds, favoriteIdsSet]);

  const catsToRender = useMemo(
    () =>
      activeTab === "all"
        ? allCats
        : favoriteIds
            .map((favoriteId) => favoriteCatsById[favoriteId])
            .filter((cat): cat is CatItem => Boolean(cat)),
    [activeTab, allCats, favoriteIds, favoriteCatsById]
  );

  useEffect(() => {
    if (activeTab !== "all") {
      return;
    }

    const handleScroll = () => {
      const viewportBottom = window.innerHeight + window.scrollY;
      const pageBottom = document.documentElement.scrollHeight;
      const isNearBottom = viewportBottom >= pageBottom - LOAD_MORE_OFFSET_PX;

      if (isNearBottom) {
        void loadCatsBatch(NEXT_CATS_BATCH_SIZE);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [activeTab, loadCatsBatch]);

  useEffect(() => {
    if (activeTab !== "all" || isLoading || isLoadingMore) {
      return;
    }

    const viewportBottom = window.innerHeight + window.scrollY;
    const pageBottom = document.documentElement.scrollHeight;

    if (viewportBottom >= pageBottom - LOAD_MORE_OFFSET_PX) {
      void loadCatsBatch(NEXT_CATS_BATCH_SIZE);
    }
  }, [activeTab, allCats.length, isLoading, isLoadingMore, loadCatsBatch]);

  return (
    <main className="app">
      <header className="app-header">
        <nav className="cats-tabs" aria-label="Разделы с котиками">
          <button
            className={`cats-tabs__item ${activeTab === "all" ? "cats-tabs__item--active" : ""}`}
            type="button"
            onClick={() => setActiveTab("all")}
          >
            Все котики
          </button>
          <button
            className={`cats-tabs__item ${activeTab === "favorites" ? "cats-tabs__item--active" : ""}`}
            type="button"
            onClick={() => setActiveTab("favorites")}
          >
            Любимые котики
          </button>
        </nav>
      </header>

      <section
        className={`cats-screen ${activeTab === "all" ? "cats-screen--all" : "cats-screen--favorites"}`}
        aria-label="Экран со списком котиков"
      >
        {activeTab === "all" && isLoading && catsToRender.length === 0 ? (
          <section className="cats-grid cats-grid--skeleton" aria-label="Загрузка карточек">
            {Array.from({ length: SKELETON_ITEMS_COUNT }).map((_, index) => (
              <div className="cat-card-skeleton" key={`skeleton-${index}`} aria-hidden="true" />
            ))}
          </section>
        ) : catsToRender.length > 0 ? (
          <section className="cats-grid" aria-label="Сетка с карточками котиков">
            {catsToRender.map((cat) => (
              <article className="cat-card" key={cat.id}>
                <img className="cat-card__image" src={cat.imageUrl} alt="Котик" loading="lazy" />

                <button
                  className={`cat-card__favorite ${favoriteIdsSet.has(cat.id) ? "cat-card__favorite--active" : ""}`}
                  type="button"
                  aria-label={
                    favoriteIdsSet.has(cat.id) ? "Убрать из избранного" : "Добавить в избранное"
                  }
                  onClick={() => toggleFavorite(cat)}
                >
                  <svg
                    className="cat-card__heart cat-card__heart--outline"
                    width="40"
                    height="37"
                    viewBox="0 0 40 37"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path d="M29 0C25.52 0 22.18 1.62 20 4.18C17.82 1.62 14.48 0 11 0C4.84 0 0 4.84 0 11C0 18.56 6.8 24.72 17.1 34.08L20 36.7L22.9 34.06C33.2 24.72 40 18.56 40 11C40 4.84 35.16 0 29 0ZM20.2 31.1L20 31.3L19.8 31.1C10.28 22.48 4 16.78 4 11C4 7 7 4 11 4C14.08 4 17.08 5.98 18.14 8.72H21.88C22.92 5.98 25.92 4 29 4C33 4 36 7 36 11C36 16.78 29.72 22.48 20.2 31.1Z" />
                  </svg>

                  <svg
                    className="cat-card__heart cat-card__heart--filled"
                    width="40"
                    height="37"
                    viewBox="0 0 40 37"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path d="M20 36.7L17.1 34.06C6.8 24.72 0 18.56 0 11C0 4.84 4.84 0 11 0C14.48 0 17.82 1.62 20 4.18C22.18 1.62 25.52 0 29 0C35.16 0 40 4.84 40 11C40 18.56 33.2 24.72 22.9 34.08L20 36.7Z" />
                  </svg>
                </button>
              </article>
            ))}
          </section>
        ) : (
          <div className="empty-state">
            <h2 className="empty-state__title">
              {loadError ? "Не удалось загрузить котиков" : "Пока здесь пусто"}
            </h2>
            <p className="empty-state__text">
              {activeTab === "favorites"
                ? "Добавь котиков в избранное на вкладке \"Все котики\"."
                : loadError ?? "Карточки появятся после загрузки."}
            </p>
          </div>
        )}

        {activeTab === "all" && isLoadingMore && catsToRender.length > 0 ? (
          <section className="cats-grid cats-grid--skeleton cats-grid--skeleton-more" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <div className="cat-card-skeleton" key={`skeleton-more-${index}`} />
            ))}
          </section>
        ) : null}

        {activeTab === "all" && (isLoading || isLoadingMore) ? (
          <p className="cats-loading">... загружаем еще котиков ...</p>
        ) : null}
      </section>
    </main>
  );
};
