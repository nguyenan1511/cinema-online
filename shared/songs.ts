// Public-domain sing-alongs for the coin karaoke booths. Melodies are synthesized in the
// browser (src/lib/karaoke.ts), so no recordings are shipped. Each note carries its syllable
// ("" = held over from the previous syllable). Lines are what the TV shows at once.

export type Note = [midi: number, beats: number, syllable: string];
export interface Song { id: string; title: string; credit: string; bpm: number; lines: Note[][] }

const C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69, B4 = 71, C5 = 72, D5 = 74, G3 = 55, Fs4 = 66;

export const SONGS: Song[] = [
  {
    id: "buom-vang", title: "Kìa con bướm vàng", credit: "Đồng dao · giai điệu Frère Jacques (dân gian Pháp)", bpm: 112,
    lines: [
      [[C4, 1, "Kìa"], [D4, 1, "con"], [E4, 1, "bướm"], [C4, 1, "vàng,"]],
      [[C4, 1, "kìa"], [D4, 1, "con"], [E4, 1, "bướm"], [C4, 1, "vàng"]],
      [[E4, 1, "Xòe"], [F4, 1, "đôi"], [G4, 2, "cánh,"]],
      [[E4, 1, "xòe"], [F4, 1, "đôi"], [G4, 2, "cánh"]],
      [[G4, 0.5, "Tung"], [A4, 0.5, "cánh"], [G4, 0.5, "bay"], [F4, 0.5, "lên"], [E4, 1, "trời,"], [C4, 1, ""]],
      [[G4, 0.5, "tung"], [A4, 0.5, "cánh"], [G4, 0.5, "bay"], [F4, 0.5, "lên"], [E4, 1, "trời"], [C4, 1, ""]],
      [[C4, 1, "Em"], [G3, 1, "ngồi"], [C4, 2, "xem,"]],
      [[C4, 1, "em"], [G3, 1, "ngồi"], [C4, 2, "xem"]],
    ],
  },
  {
    id: "twinkle", title: "Twinkle, Twinkle, Little Star", credit: "Jane Taylor (1806) · phạm vi công cộng", bpm: 100,
    lines: [
      [[C4, 1, "Twin"], [C4, 1, "kle"], [G4, 1, "twin"], [G4, 1, "kle"], [A4, 1, "lit"], [A4, 1, "tle"], [G4, 2, "star,"]],
      [[F4, 1, "How"], [F4, 1, "I"], [E4, 1, "won"], [E4, 1, "der"], [D4, 1, "what"], [D4, 1, "you"], [C4, 2, "are"]],
      [[G4, 1, "Up"], [G4, 1, "a"], [F4, 1, "bove"], [F4, 1, "the"], [E4, 1, "world"], [E4, 1, "so"], [D4, 2, "high,"]],
      [[G4, 1, "Like"], [G4, 1, "a"], [F4, 1, "dia"], [F4, 1, "mond"], [E4, 1, "in"], [E4, 1, "the"], [D4, 2, "sky"]],
      [[C4, 1, "Twin"], [C4, 1, "kle"], [G4, 1, "twin"], [G4, 1, "kle"], [A4, 1, "lit"], [A4, 1, "tle"], [G4, 2, "star,"]],
      [[F4, 1, "How"], [F4, 1, "I"], [E4, 1, "won"], [E4, 1, "der"], [D4, 1, "what"], [D4, 1, "you"], [C4, 2, "are"]],
    ],
  },
  {
    id: "birthday", title: "Happy Birthday", credit: "Hill & Hill · phạm vi công cộng", bpm: 96,
    lines: [
      [[D4, 0.75, "Hap"], [D4, 0.25, "py"], [E4, 1, "birth"], [D4, 1, "day"], [G4, 1, "to"], [Fs4, 2, "you"]],
      [[D4, 0.75, "Hap"], [D4, 0.25, "py"], [E4, 1, "birth"], [D4, 1, "day"], [A4, 1, "to"], [G4, 2, "you"]],
      [[D4, 0.75, "Hap"], [D4, 0.25, "py"], [D5, 1, "birth"], [B4, 1, "day"], [G4, 1, "dear"], [Fs4, 1, "frie"], [E4, 2, "end"]],
      [[C5, 0.75, "Hap"], [C5, 0.25, "py"], [B4, 1, "birth"], [G4, 1, "day"], [A4, 1, "to"], [G4, 2, "you"]],
    ],
  },
  {
    id: "jingle", title: "Jingle Bells", credit: "James Lord Pierpont (1857) · phạm vi công cộng", bpm: 120,
    lines: [
      [[E4, 1, "Jin"], [E4, 1, "gle"], [E4, 2, "bells,"], [E4, 1, "jin"], [E4, 1, "gle"], [E4, 2, "bells,"]],
      [[E4, 1, "Jin"], [G4, 1, "gle"], [C4, 1.5, "all"], [D4, 0.5, "the"], [E4, 4, "way"]],
      [[F4, 1, "Oh"], [F4, 1, "what"], [F4, 1.5, "fun"], [F4, 0.5, "it"], [F4, 1, "is"], [E4, 1, "to"], [E4, 1, "ride"], [E4, 0.5, "in"], [E4, 0.5, "a"]],
      [[E4, 1, "one"], [D4, 1, "horse"], [D4, 1, "o"], [E4, 1, "pen"], [D4, 2, "sleigh,"], [G4, 2, "hey!"]],
      [[E4, 1, "Jin"], [E4, 1, "gle"], [E4, 2, "bells,"], [E4, 1, "jin"], [E4, 1, "gle"], [E4, 2, "bells,"]],
      [[E4, 1, "Jin"], [G4, 1, "gle"], [C4, 1.5, "all"], [D4, 0.5, "the"], [E4, 4, "way"]],
      [[F4, 1, "Oh"], [F4, 1, "what"], [F4, 1.5, "fun"], [F4, 0.5, "it"], [F4, 1, "is"], [E4, 1, "to"], [E4, 1, "ride"], [E4, 0.5, "in"], [E4, 0.5, "a"]],
      [[G4, 1, "one"], [G4, 1, "horse"], [F4, 1, "o"], [D4, 1, "pen"], [C4, 4, "sleigh"]],
    ],
  },
];

export interface TimedNote { midi: number; start: number; dur: number; syllable: string; line: number; index: number }

/** Flatten a song into absolute times (seconds), with a lead-in so the first line can be read. */
export function schedule(song: Song, leadIn = 2): TimedNote[] {
  const spb = 60 / song.bpm;
  const out: TimedNote[] = [];
  let t = leadIn;
  song.lines.forEach((line, li) => line.forEach(([midi, beats, syllable], i) => {
    out.push({ midi, start: t, dur: beats * spb, syllable, line: li, index: i });
    t += beats * spb;
  }));
  return out;
}
export const songLength = (song: Song, leadIn = 2) => { const s = schedule(song, leadIn); const last = s[s.length - 1]; return last.start + last.dur + 1; };
export const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** Sung-time score: share of note time where the mic heard a voice, 0..100. */
export function karaokeScore(voicedSeconds: number, notes: TimedNote[]): number {
  const sung = notes.filter((n) => n.syllable !== "" || n.dur > 0).reduce((a, n) => a + n.dur, 0);
  if (sung <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((voicedSeconds / sung) * 100)));
}
