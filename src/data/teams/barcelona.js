// FC Barcelona — datos originales de jugabilidad (plantilla aprox. 2025/26).

const P = (id, name, number, position, o) => ({ id, name, number, position, ...o });

export const barcelona = {
  id: "barcelona",
  name: "Barcelona",
  abbreviation: "BAR",
  formation: "4-3-3",
  colors: {
    primary: "#a50044",   // grana
    secondary: "#004d98", // azul
    shorts: "#004d98",
    socks: "#a50044",
    trim: "#edbb00",
  },
  crest: "bar",
  players: [
    P("bar01", "Ter Stegen", 1, "GK", { speed: 40, acceleration: 42, passing: 78, shooting: 40, dribbling: 48, defending: 55, strength: 80, stamina: 58, goalkeeper: 90 }),
    P("bar02", "Koundé", 23, "RB",    { speed: 82, acceleration: 80, passing: 76, shooting: 60, dribbling: 74, defending: 85, strength: 82, stamina: 86, goalkeeper: 40 }),
    P("bar03", "Cubarsí", 5, "LCB",   { speed: 74, acceleration: 72, passing: 84, shooting: 52, dribbling: 68, defending: 84, strength: 78, stamina: 82, goalkeeper: 40 }),
    P("bar04", "Araujo", 4, "RCB",    { speed: 84, acceleration: 82, passing: 66, shooting: 58, dribbling: 60, defending: 86, strength: 90, stamina: 82, goalkeeper: 40 }),
    P("bar05", "Balde", 3, "LB",      { speed: 94, acceleration: 93, passing: 74, shooting: 62, dribbling: 84, defending: 76, strength: 74, stamina: 88, goalkeeper: 40 }),
    P("bar06", "De Jong", 21, "DM",   { speed: 78, acceleration: 78, passing: 88, shooting: 70, dribbling: 86, defending: 78, strength: 74, stamina: 88, goalkeeper: 40 }),
    P("bar07", "Pedri", 8, "CM",      { speed: 76, acceleration: 78, passing: 92, shooting: 74, dribbling: 90, defending: 68, strength: 64, stamina: 84, goalkeeper: 40 }),
    P("bar08", "Olmo", 20, "CM",      { speed: 78, acceleration: 80, passing: 86, shooting: 82, dribbling: 88, defending: 60, strength: 70, stamina: 82, goalkeeper: 40 }),
    P("bar09", "Lamine Yamal", 19, "RW", { speed: 90, acceleration: 92, passing: 86, shooting: 82, dribbling: 95, defending: 45, strength: 66, stamina: 84, goalkeeper: 40 }),
    P("bar10", "Lewandowski", 9, "ST",{ speed: 74, acceleration: 72, passing: 74, shooting: 92, dribbling: 80, defending: 48, strength: 86, stamina: 80, goalkeeper: 40 }),
    P("bar11", "Raphinha", 11, "LW",  { speed: 90, acceleration: 88, passing: 82, shooting: 84, dribbling: 86, defending: 60, strength: 74, stamina: 92, goalkeeper: 40 }),
    // ---- Suplentes ----
    P("bar12", "Joan García", 13, "GK", { speed: 40, acceleration: 42, passing: 60, shooting: 40, dribbling: 42, defending: 50, strength: 78, stamina: 55, goalkeeper: 82 }),
    P("bar13", "Eric García", 24, "RCB",{ speed: 72, acceleration: 70, passing: 80, shooting: 55, dribbling: 64, defending: 80, strength: 78, stamina: 80, goalkeeper: 40 }),
    P("bar14", "Christensen", 15, "LCB",{ speed: 70, acceleration: 68, passing: 78, shooting: 55, dribbling: 62, defending: 83, strength: 82, stamina: 78, goalkeeper: 40 }),
    P("bar15", "Martín", 35, "LB",    { speed: 80, acceleration: 80, passing: 72, shooting: 58, dribbling: 74, defending: 76, strength: 74, stamina: 84, goalkeeper: 40 }),
    P("bar16", "Gavi", 6, "CM",       { speed: 80, acceleration: 82, passing: 84, shooting: 72, dribbling: 86, defending: 76, strength: 72, stamina: 92, goalkeeper: 40 }),
    P("bar17", "Fermín", 16, "AM",    { speed: 78, acceleration: 80, passing: 80, shooting: 80, dribbling: 82, defending: 58, strength: 70, stamina: 86, goalkeeper: 40 }),
    P("bar18", "Ferran Torres", 7, "LW",{ speed: 84, acceleration: 84, passing: 76, shooting: 80, dribbling: 82, defending: 52, strength: 70, stamina: 84, goalkeeper: 40 }),
  ],
};
