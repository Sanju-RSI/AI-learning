export const roles = ['EMPLOYEE', 'MANAGER', 'ADMIN'] as const;

export type Role = (typeof roles)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && roles.some((role) => role === value);
}
