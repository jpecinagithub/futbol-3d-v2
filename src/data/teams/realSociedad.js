// Real Sociedad — datos originales de jugabilidad (plantilla aprox. 2025/26).
// Formación 4-2-3-1.

const P = (id, name, number, position, o) => ({ id, name, number, position, ...o });

export const realSociedad = {
  id: "real-sociedad",
  name: "Real Sociedad",
  abbreviation: "RSO",
  formation: "4-2-3-1",
  colors: {
    primary: "#1c5fae",   // azul
    secondary: "#ffffff", // blanco
    shorts: "#ffffff",
    socks: "#1c5fae",
    trim: "#ffffff",
  },
  crest: "rso",
  players: [
    P("rso01", "Remiro", 1, "GK",     { speed: 40, acceleration: 42, passing: 62, shooting: 40, dribbling: 44, defending: 55, strength: 80, stamina: 58, goalkeeper: 85 }),
    P("rso02", "Traoré", 18, "RB",    { speed: 84, acceleration: 84, passing: 72, shooting: 60, dribbling: 76, defending: 78, strength: 76, stamina: 86, goalkeeper: 40 }),
    P("rso03", "Zubeldia", 5, "LCB",   { speed: 74, acceleration: 72, passing: 74, shooting: 55, dribbling: 62, defending: 83, strength: 84, stamina: 82, goalkeeper: 40 }),
    P("rso04", "Aguerd", 21, "RCB",    { speed: 78, acceleration: 76, passing: 74, shooting: 55, dribbling: 64, defending: 83, strength: 84, stamina: 82, goalkeeper: 40 }),
    P("rso05", "Muñoz", 3, "LB",       { speed: 80, acceleration: 80, passing: 74, shooting: 62, dribbling: 76, defending: 79, strength: 76, stamina: 86, goalkeeper: 40 }),
    P("rso06", "Turrientes", 22, "DM", { speed: 72, acceleration: 72, passing: 80, shooting: 64, dribbling: 74, defending: 78, strength: 78, stamina: 86, goalkeeper: 40 }),
    P("rso07", "Marín", 16, "DM",      { speed: 70, acceleration: 70, passing: 80, shooting: 66, dribbling: 72, defending: 78, strength: 82, stamina: 86, goalkeeper: 40 }),
    P("rso08", "Kubo", 14, "RW",       { speed: 86, acceleration: 88, passing: 82, shooting: 78, dribbling: 90, defending: 55, strength: 66, stamina: 84, goalkeeper: 40 }),
    P("rso09", "Brais Méndez", 23, "AM",{ speed: 76, acceleration: 76, passing: 84, shooting: 80, dribbling: 82, defending: 62, strength: 72, stamina: 84, goalkeeper: 40 }),
    P("rso10", "Barrenetxea", 7, "LW", { speed: 84, acceleration: 84, passing: 76, shooting: 76, dribbling: 84, defending: 58, strength: 70, stamina: 86, goalkeeper: 40 }),
    P("rso11", "Oyarzabal", 10, "ST",  { speed: 78, acceleration: 78, passing: 80, shooting: 84, dribbling: 82, defending: 60, strength: 76, stamina: 86, goalkeeper: 40 }),
    // ---- Suplentes ----
    P("rso12", "Marrero", 13, "GK",    { speed: 40, acceleration: 42, passing: 56, shooting: 40, dribbling: 42, defending: 50, strength: 76, stamina: 55, goalkeeper: 72 }),
    P("rso13", "Aramburu", 19, "RB",  { speed: 82, acceleration: 82, passing: 70, shooting: 58, dribbling: 74, defending: 78, strength: 76, stamina: 86, goalkeeper: 40 }),
    P("rso14", "Elustondo", 6, "RCB", { speed: 70, acceleration: 68, passing: 70, shooting: 58, dribbling: 60, defending: 80, strength: 84, stamina: 78, goalkeeper: 40 }),
    P("rso15", "J. López", 17, "LB",  { speed: 80, acceleration: 80, passing: 72, shooting: 60, dribbling: 74, defending: 77, strength: 74, stamina: 84, goalkeeper: 40 }),
    P("rso16", "Zakharyan", 12, "AM", { speed: 78, acceleration: 78, passing: 80, shooting: 76, dribbling: 84, defending: 55, strength: 70, stamina: 82, goalkeeper: 40 }),
    P("rso17", "Óskarsson", 9, "ST",  { speed: 80, acceleration: 80, passing: 68, shooting: 80, dribbling: 76, defending: 50, strength: 80, stamina: 84, goalkeeper: 40 }),
    P("rso18", "Becker", 11, "LW",    { speed: 88, acceleration: 88, passing: 72, shooting: 74, dribbling: 84, defending: 52, strength: 68, stamina: 84, goalkeeper: 40 }),
  ],
};
