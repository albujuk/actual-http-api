export type Category = { id: string; name: string; is_income: boolean; hidden: boolean; group_id: string };

export type CategoryGroup = {
  id: string;
  name: string;
  is_income: boolean;
  hidden: boolean;
  categories: Category[];
};

export type HiddenFilter = { hidden?: boolean };

export interface CategoryReader {
  list(filter: HiddenFilter): Promise<Category[]>;
  groups(filter: HiddenFilter): Promise<CategoryGroup[]>;
}
