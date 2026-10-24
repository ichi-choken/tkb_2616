import type { SteamTrust } from '../../packages/integrations/src/trust';

export type UserSteamTrust = SteamTrust & { userId: string };
type ReadBatch = (userIds: string[], gameIds: number[]) => Promise<UserSteamTrust[]>;

// steam-trust accepts at most 50 people per request. A recruitment can have more applicants.
export async function readSteamTrustBatches(userIds: string[], gameIds: number[], readBatch: ReadBatch): Promise<UserSteamTrust[]> {
  const people = [...new Set(userIds)];
  const games = [...new Set(gameIds)];
  const users = new Map<string, UserSteamTrust>();
  for (let offset = 0; offset < people.length; offset += 50) {
    const batch = await readBatch(people.slice(offset, offset + 50), games);
    for (const user of batch) users.set(user.userId, user);
  }
  return [...users.values()];
}
