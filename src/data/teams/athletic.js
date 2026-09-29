// Athletic Club — datos originales de jugabilidad (plantilla aprox. 2025/26).
// Formación 4-4-2.

const P = (id, name, number, position, o) => ({ id, name, number, position, ...o });

export const athletic = {
  id: "athletic",
  name: "Athletic Club",
  abbreviation: "ATH",
  formation: "4-4-2",
  colors: {
    primary: "#d0202e",   // rojo
    secondary: "#ffffff", // blanco (franjas)
    shorts: "#1a1a1a",
    socks: "#d0202e",
    trim: "#ffffff",
  },
  crest: "ath",
  players: [
    P("ath01", "Unai Simón", 1, "GK", { speed: 40, acceleration: 42, passing: 64, shooting: 40, dribbling: 44, defending: 55, strength: 82, stamina: 58, goalkeeper: 86 }),
    P("ath02", "Gorosabel", 2, "RB",  { speed: 80, acceleration: 80, passing: 72, shooting: 58, dribbling: 72, defending: 80, strength: 78, stamina: 86, goalkeeper: 40 }),
    P("ath03", "Vivian", 3, "LCB",    { speed: 78, acceleration: 76, passing: 70, shooting: 55, dribbling: 62, defending: 84, strength: 86, stamina: 84, goalkeeper: 40 }),
    P("ath04", "Paredes", 4, "RCB",   { speed: 74, acceleration: 72, passing: 72, shooting: 55, dribbling: 60, defending: 82, strength: 86, stamina: 82, goalkeeper: 40 }),
    P("ath05", "Yuri", 17, "LB",      { speed: 78, acceleration: 78, passing: 76, shooting: 66, dribbling: 74, defending: 80, strength: 80, stamina: 86, goalkeeper: 40 }),
    P("ath06", "Jauregizar", 16, "LM",{ speed: 82, acceleration: 82, passing: 76, shooting: 70, dribbling: 80, defending: 72, strength: 74, stamina: 90, goalkeeper: 40 }),
    P("ath07", "Vesga", 6, "CM",      { speed: 68, acceleration: 66, passing: 78, shooting: 64, dribbling: 68, defending: 78, strength: 84, stamina: 84, goalkeeper: 40 }),
    P("ath08", "Prados", 24, "CM",    { speed: 72, acceleration: 72, passing: 78, shooting: 66, dribbling: 72, defending: 76, strength: 78, stamina: 86, goalkeeper: 40 }),
    P("ath09", "I. Williams", 9, "RM",{ speed: 92, acceleration: 90, passing: 76, shooting: 78, dribbling: 84, defending: 55, strength: 78, stamina: 90, goalkeeper: 40 }),
    P("ath10", "Guruzeta", 12, "ST",  { speed: 80, acceleration: 80, passing: 68, shooting: 80, dribbling: 74, defending: 55, strength: 84, stamina: 86, goalkeeper: 40 }),
    P("ath11", "N. Williams", 10, "ST",{ speed: 94, acceleration: 95, passing: 78, shooting: 80, dribbling: 92, defending: 50, strength: 72, stamina: 88, goalkeeper: 40 }),
    // ---- Suplentes ----
    P("ath12", "Agirrezabala", 13, "GK",{ speed: 40, acceleration: 42, passing: 58, shooting: 40, dribbling: 42, defending: 50, strength: 78, stamina: 55, goalkeeper: 78 }),
    P("ath13", "Yeray", 5, "RCB",     { speed: 74, acceleration: 72, passing: 68, shooting: 52, dribbling: 58, defending: 82, strength: 84, stamina: 80, goalkeeper: 40 }),
    P("ath14", "Lekue", 15, "RB",     { speed: 80, acceleration: 80, passing: 70, shooting: 56, dribbling: 72, defending: 78, strength: 76, stamina: 86, goalkeeper: 40 }),
    P("ath15", "Berchiche", 17, "LB", { speed: 76, acceleration: 76, passing: 72, shooting: 60, dribbling: 70, defending: 78, strength: 78, stamina: 84, goalkeeper: 40 }),
    P("ath16", "Sancet", 8, "AM",     { speed: 78, acceleration: 80, passing: 82, shooting: 80, dribbling: 86, defending: 58, strength: 76, stamina: 82, goalkeeper: 40 }),
    P("ath17", "Berenguer", 7, "RW",  { speed: 82, acceleration: 82, passing: 76, shooting: 76, dribbling: 84, defending: 55, strength: 70, stamina: 84, goalkeeper: 40 }),
    P("ath18", "Djaló", 11, "LW",     { speed: 86, acceleration: 86, passing: 70, shooting: 72, dribbling: 84, defending: 48, strength: 68, stamina: 82, goalkeeper: 40 }),
  ],
};
