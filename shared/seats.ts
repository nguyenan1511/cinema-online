// Auditorium layout shared by the ticket rules, the seat chart and the 3D hall.
export const ROWS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;
export const COLS = 16;
/** The centre aisle runs between seat AISLE_AFTER and AISLE_AFTER + 1. */
export const AISLE_AFTER = 8;
export const SEAT_RE = /^[A-L](1[0-6]|[1-9])$/;
export const allSeats = (): string[] => ROWS.flatMap((r) => Array.from({ length: COLS }, (_, i) => `${r}${i + 1}`));
