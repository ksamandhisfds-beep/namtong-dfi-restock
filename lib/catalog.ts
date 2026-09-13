export type Product = {
  id: string;
  name: string;
};

export type Branch = {
  id: string;
  name: string;
  retailBrand: string;
  district: string;
  address: string;
  productIds: string[];
};

export const PRODUCTS: Product[] = [
  { id: "133216", name: "睡眠八寶茶" },
  { id: "133230", name: "氣血四寶茶" },
  { id: "133223", name: "冰糖雪梨茶" },
  { id: "133254", name: "黑糖薑母茶" },
  { id: "133247", name: "皇牌降三高茶" },
  { id: "133261", name: "消脂荷檸茶" },
];

export const BRANCHES: Branch[] = [
  {
    id: "langham_place",
    name: "朗豪坊",
    retailBrand: "Market Place",
    district: "旺角",
    address: "九龍旺角亞皆老街8號朗豪坊地庫B2 8號舖",
    productIds: ["133216", "133230", "133223", "133254", "133247", "133261"],
  },
  {
    id: "elements",
    name: "圓方",
    retailBrand: "3hreesixty",
    district: "九龍站",
    address: "九龍尖沙咀柯士甸道西1號ELEMENTS圓方木區1樓1090號舖",
    productIds: ["133216", "133230", "133223", "133254", "133247", "133261"],
  },
  {
    id: "k11",
    name: "K11",
    retailBrand: "Market Place",
    district: "尖沙咀",
    address: "九龍尖沙咀河內道18號K11地庫一樓B111號至B121號舖",
    productIds: ["133216", "133230", "133223", "133254", "133261"],
  },
  {
    id: "the_belchers",
    name: "西寶城",
    retailBrand: "Wellcome Fresh",
    district: "西環",
    address: "香港西環卑路乍街8號西寶城3樓301號舖",
    productIds: ["133216", "133230", "133223", "133254", "133261"],
  },
];

export const PRODUCT_BY_ID = Object.fromEntries(
  PRODUCTS.map((product) => [product.id, product]),
) as Record<string, Product>;

export const BRANCH_BY_ID = Object.fromEntries(
  BRANCHES.map((branch) => [branch.id, branch]),
) as Record<string, Branch>;
