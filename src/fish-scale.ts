import type { GoldKind } from "./world";

export type SizeClass = "small" | "medium" | "large" | "giant";
export interface FishScale {
  /** Reference specimen for the illustration, not a claim about every adult. */
  lengthCm: number;
  measurement: { en: string; zh: string };
  source: { label: string; url: string };
}

// Fancy breeds share the species reference: published wild-species measurements
// do not justify inventing a separate precise adult length for each breed.
const goldfish: FishScale = {
  lengthCm: 20,
  measurement: { en: "Usually 15–20 cm; goldfish species reference, breeds vary", zh: "通常 15–20 cm；采用金鱼物种参考，品种与个体有差异" },
  source: { label: "USGS · Goldfish", url: "https://nas.er.usgs.gov/queries/factsheet.aspx?speciesid=508" },
};

export const FISH_SCALE: Record<GoldKind, FishScale> = {
  ryukin: goldfish, oranda: goldfish, moor: goldfish,
  fantail: goldfish, pearl: goldfish, calico: goldfish,
  clown: {
    lengthCm: 11,
    measurement: { en: "Common clownfish: up to 11 cm", zh: "公子小丑鱼：最大约 11 cm" },
    source: { label: "FishBase · Amphiprion ocellaris", url: "https://www.fishbase.org/summary/Amphiprion-ocellaris.html" },
  },
  angelfish: {
    lengthCm: 15,
    measurement: { en: "Freshwater angelfish: body length about 15 cm; fins add height", zh: "淡水神仙鱼：体长约 15 cm，长鳍另增加高度" },
    source: { label: "USGS · Freshwater angelfish", url: "https://nas.er.usgs.gov/queries/FactSheet.aspx?speciesID=475" },
  },
  butterfly: {
    lengthCm: 20,
    measurement: { en: "Raccoon butterflyfish reference: about 20 cm", zh: "以月斑蝴蝶鱼为参考：约 20 cm" },
    source: { label: "Georgia Aquarium · Raccoon butterflyfish", url: "https://www.georgiaaquarium.org/animal/raccoon-butterflyfish/" },
  },
  tang: {
    lengthCm: 25,
    measurement: { en: "Palette surgeonfish: about 25 cm", zh: "蓝倒吊：约 25 cm" },
    source: { label: "Georgia Aquarium · Palette surgeonfish", url: "https://www.georgiaaquarium.org/animal/palette-surgeonfish/" },
  },
  puffer: {
    lengthCm: 35,
    measurement: { en: "Longspined porcupinefish: about 35 cm, uninflated", zh: "长棘刺豚：约 35 cm，展示未膨胀形态" },
    source: { label: "Australian Museum · Porcupinefish", url: "https://australian.museum/learn/animals/fishes/freckled-porcupinefish-diodon-holocanthus-linnaeus-1758/" },
  },
  lionfish: {
    lengthCm: 38,
    measurement: { en: "Red lionfish: up to 38 cm, excluding spread of fins", zh: "蓑鲉（狮子鱼）：最大约 38 cm，不把展开鳍幅当体长" },
    source: { label: "Animal Diversity Web · Red lionfish", url: "https://animaldiversity.org/accounts/Pterois_volitans/" },
  },
  octopus: {
    lengthCm: 80,
    measurement: { en: "Big blue octopus: arm span about 80 cm; mantle about 16 cm", zh: "蓝章鱼：腕展约 80 cm，外套膜约 16 cm；腕展不等于鱼体长" },
    source: { label: "Animal Diversity Web · Big blue octopus", url: "https://animaldiversity.org/accounts/Octopus_cyanea/" },
  },
  koi: {
    lengthCm: 90,
    measurement: { en: "Adult koi can reach about 90 cm; illustration uses a large adult", zh: "成年锦鲤可达约 90 cm；画面采用较大成体作为参考" },
    source: { label: "Smithsonian's National Zoo · Koi", url: "https://nationalzoo.si.edu/animals/japanese-koi" },
  },
  barracuda: {
    lengthCm: 150,
    measurement: { en: "Great barracuda: a large adult is about 1.5 m; reported maximum 2 m", zh: "大梭鱼：较大成体约 1.5 m，记录最大约 2 m" },
    source: { label: "Florida Museum · Great barracuda", url: "https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/great-barracuda/" },
  },
  shark: {
    lengthCm: 450,
    measurement: { en: "Adult great white: about 3.4–4.9 m; illustration reference 4.5 m", zh: "成年大白鲨：约 3.4–4.9 m；画面参考体长 4.5 m" },
    source: { label: "Smithsonian Ocean · Great white size", url: "https://ocean.si.edu/ocean-life/sharks-rays/how-big-are-great-white-sharks" },
  },
};

/** Project display bins, not a biological classification. */
export function sizeClass(lengthCm: number): SizeClass {
  return lengthCm <= 30 ? "small" : lengthCm <= 100 ? "medium" : lengthCm <= 200 ? "large" : "giant";
}

export const LENGTH_EXPONENT = 0.72;

/** Compress real lengths to keep small fish legible, with one shared viewport scale. */
export function speciesLengthPixels(kind: GoldKind, width: number, height: number): number {
  const base = Math.max(28, Math.min(65, Math.min(width, height) * 0.09));
  const largest = base * Math.pow(FISH_SCALE.shark.lengthCm / 20, LENGTH_EXPONENT);
  const fit = Math.min(1, width * 0.68 / largest, height * 0.85 / largest);
  return base * fit * Math.pow(FISH_SCALE[kind].lengthCm / 20, LENGTH_EXPONENT);
}
