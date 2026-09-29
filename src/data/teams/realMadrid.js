// Real Madrid — datos originales de jugabilidad (nombres reales de la plantilla aprox. 2025/26).
// Escudo y colores inspirados solo en la identidad cromática del club (diseño propio).

const P = (id, name, number, position, o) => ({ id, name, number, position, ...o });

export const realMadrid = {
  id: "real-madrid",
  name: "Real Madrid",
  abbreviation: "RMA",
  formation: "4-3-3",
  colors: {
    primary: "#ffffff",   // camiseta blanca
    secondary: "#c9a227", // dorado
    shorts: "#ffffff",
    socks: "#ffffff",
    trim: "#1c2c6e",
  },
  // Escudo SVG original: círculo blanco con anillo dorado y franja diagonal.
  crest: "rma",
  players: [
    // ---- Titulares (4-3-3) ----
    P("rma01", "Courtois", 1, "GK",   { speed: 42, acceleration: 45, passing: 62, shooting: 40, dribbling: 45, defending: 55, strength: 82, stamina: 60, goalkeeper: 94 }),
    P("rma02", "Carvajal", 2, "RB",   { speed: 78, acceleration: 80, passing: 76, shooting: 62, dribbling: 74, defending: 84, strength: 78, stamina: 86, goalkeeper: 40 }),
    P("rma03", "Rüdiger", 22, "LCB",  { speed: 76, acceleration: 74, passing: 68, shooting: 55, dribbling: 60, defending: 87, strength: 90, stamina: 82, goalkeeper: 40 }),
    P("rma04", "Militão", 3, "RCB",   { speed: 84, acceleration: 82, passing: 70, shooting: 58, dribbling: 62, defending: 85, strength: 86, stamina: 80, goalkeeper: 40 }),
    P("rma05", "Mendy", 23, "LB",     { speed: 82, acceleration: 84, passing: 70, shooting: 55, dribbling: 76, defending: 83, strength: 80, stamina: 84, goalkeeper: 40 }),
    P("rma06", "Valverde", 8, "DM",   { speed: 88, acceleration: 86, passing: 84, shooting: 82, dribbling: 80, defending: 80, strength: 84, stamina: 95, goalkeeper: 40 }),
    P("rma07", "Tchouaméni", 14, "CM",{ speed: 72, acceleration: 70, passing: 82, shooting: 70, dribbling: 72, defending: 84, strength: 88, stamina: 88, goalkeeper: 40 }),
    P("rma08", "Bellingham", 5, "CM", { speed: 80, acceleration: 82, passing: 84, shooting: 84, dribbling: 86, defending: 78, strength: 86, stamina: 92, goalkeeper: 40 }),
    P("rma09", "Vinícius", 7, "LW",   { speed: 95, acceleration: 96, passing: 78, shooting: 84, dribbling: 94, defending: 45, strength: 70, stamina: 88, goalkeeper: 40 }),
    P("rma10", "Mbappé", 9, "ST",     { speed: 97, acceleration: 96, passing: 80, shooting: 93, dribbling: 93, defending: 42, strength: 78, stamina: 88, goalkeeper: 40 }),
    P("rma11", "Rodrygo", 11, "RW",   { speed: 90, acceleration: 90, passing: 80, shooting: 82, dribbling: 90, defending: 48, strength: 66, stamina: 86, goalkeeper: 40 }),
    // ---- Suplentes ----
    P("rma12", "Lunin", 13, "GK",     { speed: 40, acceleration: 42, passing: 58, shooting: 40, dribbling: 42, defending: 50, strength: 76, stamina: 55, goalkeeper: 84 }),
    P("rma13", "Alaba", 4, "LCB",     { speed: 70, acceleration: 68, passing: 84, shooting: 72, dribbling: 70, defending: 82, strength: 78, stamina: 76, goalkeeper: 40 }),
    P("rma14", "Asencio", 17, "RCB",  { speed: 78, acceleration: 76, passing: 68, shooting: 52, dribbling: 60, defending: 80, strength: 82, stamina: 80, goalkeeper: 40 }),
    P("rma15", "Fran García", 20, "LB",{ speed: 84, acceleration: 84, passing: 72, shooting: 58, dribbling: 76, defending: 76, strength: 72, stamina: 88, goalkeeper: 40 }),
    P("rma16", "Camavinga", 6, "CM",  { speed: 84, acceleration: 86, passing: 80, shooting: 68, dribbling: 84, defending: 80, strength: 78, stamina: 90, goalkeeper: 40 }),
    P("rma17", "Güler", 15, "AM",     { speed: 76, acceleration: 78, passing: 86, shooting: 80, dribbling: 88, defending: 50, strength: 62, stamina: 78, goalkeeper: 40 }),
    P("rma18", "Brahim", 21, "RW",    { speed: 86, acceleration: 88, passing: 78, shooting: 78, dribbling: 90, defending: 45, strength: 64, stamina: 82, goalkeeper: 40 }),
  ],
};
