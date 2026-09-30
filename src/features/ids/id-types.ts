export const NAME_TYPES = ["accounts", "categories", "payees", "schedules"] as const;
export type NameType = (typeof NAME_TYPES)[number];

export interface NameResolver {
  idByName(type: NameType, name: string): Promise<string>;
}
