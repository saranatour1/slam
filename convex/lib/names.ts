const ADJECTIVES = [
  "Brisk", "Quiet", "Bold", "Witty", "Sly", "Calm", "Fierce", "Jolly",
  "Nimble", "Grumpy", "Sunny", "Zesty", "Mellow", "Rowdy", "Sharp", "Swift",
  "Curious", "Dapper", "Eager", "Frank", "Gentle", "Humble", "Keen", "Lucky",
];

const ANIMALS = [
  "Otter", "Falcon", "Badger", "Lynx", "Heron", "Marmot", "Raven", "Walrus",
  "Gecko", "Puffin", "Yak", "Ibis", "Koala", "Newt", "Osprey", "Quokka",
  "Stoat", "Tapir", "Urchin", "Viper", "Wombat", "Zebra", "Bison", "Coyote",
];

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

/** e.g. "Brisk Otter 42" */
export function randomDisplayName(): string {
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)} ${Math.floor(Math.random() * 90) + 10}`;
}

export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 7);
  return base.length > 0 ? `${base}-${suffix}` : suffix;
}
