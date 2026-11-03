// Emit data/films.index.json ({id,title,posterPath}) for the edge routes, so their
// bundle does not grow with every film's full record (eng review P1).
import { readFileSync, writeFileSync } from "node:fs";

const films = JSON.parse(readFileSync(new URL("../data/films.json", import.meta.url), "utf8"));
const index = films.map(({ id, title, posterPath }) => ({ id, title, posterPath }));
writeFileSync(new URL("../data/films.index.json", import.meta.url), JSON.stringify(index) + "\n");
console.log(`films.index.json: ${index.length} films`);
