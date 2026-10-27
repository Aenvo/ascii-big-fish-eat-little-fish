import type { GoldKind } from "./world";
import { FISH_SCALE, sizeClass, type FishScale, type SizeClass } from "./fish-scale";

/** Reference adult-size bins shared with the game's species scale. */
export type CatalogSize = SizeClass;
export interface CatalogEntry {
  id: string;
  kind?: GoldKind;
  speciesIndex?: number;
  size: CatalogSize;
  scale?: FishScale;
  name: { en: string; zh: string };
  habit: { en: string; zh: string };
  source: { label: string; url: string };
}

const GOLD = { label: "Animal Diversity Web", url: "https://animaldiversity.org/accounts/Carassius_auratus/" };
const CATALOG_DATA: Omit<CatalogEntry, "size" | "scale">[] = [
  {
    id: "neon", speciesIndex: 0,
    name: { en: "Neon tetra", zh: "红绿灯鱼" },
    habit: { en: "A freshwater fish from South American streams; adults eat small insects, crustaceans and plant matter.", zh: "生活在南美淡水溪流中；成鱼取食小昆虫、甲壳动物和植物性食物。" },
    source: { label: "FishBase", url: "https://www.fishbase.se/Fieldguide/FieldGuideSummary.php?c_code=242&genusname=Paracheirodon&speciesname=innesi" },
  },
  {
    id: "cardinal", speciesIndex: 1,
    name: { en: "Cardinal tetra", zh: "宝莲灯鱼" },
    habit: { en: "In South American freshwater, cardinal tetras form schools and eat aquatic insects and larvae.", zh: "宝莲灯鱼生活在南美淡水中，常群游，取食水生昆虫和幼虫。" },
    source: { label: "National Aquarium", url: "https://aqua.org/explore/animals/cardinal-tetra" },
  },
  {
    id: "glowlight", speciesIndex: 2,
    name: { en: "Glowlight tetra", zh: "红莲灯鱼" },
    habit: { en: "Native to the Essequibo River, it eats worms, small crustaceans and plant material.", zh: "原产于南美埃塞奎博河，取食蠕虫、小型甲壳动物和植物性食物。" },
    source: { label: "FishBase", url: "https://fishbase.se/Country/CountrySpeciesSummary.php?c_code=328&id=10642" },
  },
  {
    id: "rasbora", speciesIndex: 3,
    name: { en: "Harlequin rasbora", zh: "三角灯鱼" },
    habit: { en: "A schooling freshwater fish associated with slow, acidic swamp streams.", zh: "一种群游淡水鱼，生活在缓慢流动、偏酸性的沼泽溪流中。" },
    source: { label: "Singapore National Parks", url: "https://biodiversitysg.nparks.gov.sg/our-biodiversity/freshwater-fishes-and-invertebrates/harlequin-rasbora/" },
  },
  {
    id: "guppy", speciesIndex: 4,
    name: { en: "Guppy", zh: "孔雀鱼" },
    habit: { en: "An omnivorous livebearing fish found in a variety of freshwater and brackish habitats.", zh: "杂食性胎生鱼，能够生活在多种淡水及微咸水环境中。" },
    source: { label: "U.S. Fish & Wildlife Service", url: "https://www.fws.gov/media/ecological-risk-screening-summary-guppy-poecilia-reticulata-high-risk" },
  },
  {
    id: "shrimp", speciesIndex: 5,
    name: { en: "Shrimp", zh: "小虾" },
    habit: { en: "Shrimp vary by species; for example, white shrimp forage on detritus, plants and small animals near the bottom.", zh: "虾的习性因种类而异；例如白虾会在水底取食碎屑、植物和小型动物。" },
    source: { label: "NOAA Fisheries: white shrimp", url: "https://www.fisheries.noaa.gov/species/white-shrimp" },
  },
  {
    id: "clown", kind: "clown",
    name: { en: "Clownfish", zh: "小丑鱼" },
    habit: { en: "Some clownfish, including the common clownfish, shelter among sea anemones on coral reefs.", zh: "部分小丑鱼，例如公子小丑鱼，会在珊瑚礁的海葵中寻找庇护。" },
    source: { label: "Animal Diversity Web: common clownfish", url: "https://animaldiversity.org/accounts/Amphiprion_ocellaris/" },
  },
  {
    id: "angelfish", kind: "angelfish",
    name: { en: "Angelfish", zh: "神仙鱼" },
    habit: { en: "For example, freshwater angelfish live among dense plants in slow-moving water and eat small animals and algae.", zh: "例如，淡水神仙鱼生活在水流缓慢、水草密集的区域，取食小型动物和藻类。" },
    source: { label: "National Aquarium: freshwater angelfish", url: "https://aqua.org/explore/animals/freshwater-angelfish" },
  },
  {
    id: "butterfly", kind: "butterfly",
    name: { en: "Butterflyfish", zh: "蝴蝶鱼" },
    habit: { en: "Many butterflyfish live near shallow reefs; diets vary between species and may include invertebrates, algae or coral polyps.", zh: "许多蝴蝶鱼栖息于浅海珊瑚礁附近；不同种类取食无脊椎动物、藻类或珊瑚虫。" },
    source: { label: "Animal Diversity Web", url: "https://animaldiversity.org/accounts/Chaetodontidae/" },
  },
  {
    id: "puffer", kind: "puffer",
    name: { en: "Porcupinefish", zh: "刺豚" },
    habit: { en: "Some porcupinefish can inflate by swallowing water when threatened, making them harder for predators to swallow.", zh: "部分刺豚受到威胁时会吞水膨胀，使捕食者更难吞食。" },
    source: { label: "Animal Diversity Web: balloonfish", url: "https://animaldiversity.org/accounts/Diodon_holocanthus/" },
  },
  {
    id: "ryukin", kind: "ryukin",
    name: { en: "Ryukin goldfish", zh: "琉金" },
    habit: { en: "Goldfish are opportunistic omnivores and search plants and sandy bottoms for food.", zh: "金鱼是机会主义杂食动物，会在水草和沙底间寻找食物。" }, source: GOLD,
  },
  {
    id: "oranda", kind: "oranda",
    name: { en: "Oranda goldfish", zh: "狮子头" },
    habit: { en: "Goldfish eat a varied diet that can include plants, insects and small crustaceans.", zh: "金鱼食性广，可取食植物、昆虫和小型甲壳动物。" }, source: GOLD,
  },
  {
    id: "moor", kind: "moor",
    name: { en: "Black moor goldfish", zh: "黑龙睛" },
    habit: { en: "Goldfish can form schools and use chemical signals to warn one another of predators.", zh: "金鱼可以群游，并通过化学信号向同伴传递捕食者警报。" }, source: GOLD,
  },
  {
    id: "fantail", kind: "fantail",
    name: { en: "Fantail goldfish", zh: "丹凤金鱼" },
    habit: { en: "Like other goldfish, this variety is omnivorous; goldfish forage among aquatic plants and on sandy bottoms.", zh: "与其他金鱼一样属于杂食性鱼类；金鱼常在水草间或沙底觅食。" }, source: GOLD,
  },
  {
    id: "pearl", kind: "pearl",
    name: { en: "Pearlscale goldfish", zh: "珍珠鳞" },
    habit: { en: "Goldfish feed opportunistically on a mixture of plant matter and small aquatic animals.", zh: "金鱼会因地制宜地取食植物性食物和小型水生动物。" }, source: GOLD,
  },
  {
    id: "calico", kind: "calico",
    name: { en: "Calico goldfish", zh: "五花金鱼" },
    habit: { en: "Goldfish forage widely and may gather in groups when avoiding predators.", zh: "金鱼会在水域中广泛觅食，也可能通过群聚躲避捕食者。" }, source: GOLD,
  },
  {
    id: "tang", kind: "tang",
    name: { en: "Blue tang", zh: "蓝倒吊" },
    habit: { en: "Blue tangs live near tropical reefs and feed on zooplankton, occasionally eating algae.", zh: "蓝倒吊生活在热带珊瑚礁附近，取食浮游动物，偶尔也吃藻类。" },
    source: { label: "FishBase", url: "https://www.fishbase.se/summary/SpeciesSummary.php?AT=blue+tang&ID=6017" },
  },
  {
    id: "barracuda", kind: "barracuda",
    name: { en: "Great barracuda", zh: "大梭鱼" },
    habit: { en: "Barracudas vary by species; great barracuda, for example, ambush fish and can make fast bursts.", zh: "梭鱼习性因种类而异；例如大梭鱼会伏击鱼类，并能短距离快速冲刺。" },
    source: { label: "Florida Museum: great barracuda", url: "https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/great-barracuda/" },
  },
  {
    id: "lionfish", kind: "lionfish",
    name: { en: "Lionfish", zh: "狮子鱼" },
    habit: { en: "Some lionfish shelter among rocks and coral by day and hunt after dark; their fin spines are venomous.", zh: "部分狮子鱼白天躲在岩石或珊瑚间、夜间捕食；其鳍棘具有毒性。" },
    source: { label: "Animal Diversity Web: red lionfish", url: "https://animaldiversity.org/accounts/Pterois_volitans/" },
  },
  {
    id: "octopus", kind: "octopus",
    name: { en: "Big blue octopus", zh: "蓝章鱼" },
    habit: { en: "For example, the big blue octopus hunts small fish, crustaceans and mollusks around coral reefs.", zh: "例如，蓝章鱼在珊瑚礁附近捕食小鱼、甲壳类和软体动物。" },
    source: { label: "Animal Diversity Web: big blue octopus", url: "https://animaldiversity.org/accounts/Octopus_cyanea/" },
  },
  {
    id: "koi", kind: "koi",
    name: { en: "Koi", zh: "锦鲤" },
    habit: { en: "Koi are ornamental carp that forage along the bottom for a variety of plant and animal food.", zh: "锦鲤是观赏鲤鱼，会沿水底觅食多种植物和动物性食物。" },
    source: { label: "U.S. Fish & Wildlife Service", url: "https://www.fws.gov/sites/default/files/documents/Ecological-Risk-Screening-Summary-Koi.pdf" },
  },
  {
    id: "shark", kind: "shark",
    name: { en: "Great white shark", zh: "大白鲨" },
    habit: { en: "Great white sharks range widely; their diet changes with age, from smaller prey to marine mammals and carrion.", zh: "大白鲨活动范围广；食物随年龄变化，从较小的猎物转向海洋哺乳动物及动物尸体。" },
    source: { label: "NOAA Fisheries", url: "https://www.fisheries.noaa.gov/species/white-shark" },
  },
];

export const CATALOG: CatalogEntry[] = CATALOG_DATA.map(entry => {
  const scale = entry.kind ? FISH_SCALE[entry.kind] : undefined;
  return { ...entry, scale, size: scale ? sizeClass(scale.lengthCm) : "small" };
});
