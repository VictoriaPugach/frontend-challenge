export type CatApiItem = {
  id: string;
  url: string;
};

const CAT_API_URL = "https://api.thecatapi.com/v1/images/search";

export const fetchCats = async (limit = 15, signal?: AbortSignal): Promise<CatApiItem[]> => {
  const apiKey = import.meta.env.VITE_CAT_API_KEY;
  const query = new URLSearchParams({ limit: String(limit) });

  const response = await fetch(`${CAT_API_URL}?${query.toString()}`, {
    method: "GET",
    headers: {
      "x-api-key": apiKey
    },
    signal
  });

  if (!response.ok) {
    throw new Error("Не удалось загрузить котиков");
  }

  const data: unknown = await response.json();

  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const id = "id" in item ? item.id : null;
      const url = "url" in item ? item.url : null;

      if (typeof id !== "string" || typeof url !== "string") {
        return null;
      }

      return { id, url };
    })
    .filter((item): item is CatApiItem => item !== null);
};
