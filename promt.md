# OBJETIVO GENERAL

Desarrolla un videojuego de fútbol 3D para navegador inspirado en la sensación jugable de los grandes simuladores de fútbol como Pro Evolution Soccer / eFootball, pero con una implementación, interfaz, código, modelos, animaciones y dirección artística originales.

El juego debe ser realmente jugable y no una simple demostración visual.

Quiero poder:

- elegir dos equipos;
- jugar partidos completos;
- controlar futbolistas individualmente;
- pasar;
- tirar;
- centrar;
- regatear;
- esprintar;
- defender;
- hacer entradas;
- recuperar balones;
- marcar goles;
- sacar córners;
- realizar saques de banda;
- realizar saques de puerta;
- cometer faltas;
- recibir tarjetas;
- lanzar faltas;
- lanzar penaltis;
- ver repeticiones automáticas;
- consultar marcador y estadísticas.

El objetivo prioritario es conseguir una sensación de partido de fútbol realista y dinámica.

No copies código, assets, HUD, sonidos, gráficos, estadios, modelos, animaciones ni interfaces de PES/eFootball.

---

# STACK TÉCNICO

La aplicación debe utilizar:

- Vite
- React
- JavaScript o TypeScript
- Three.js
- React Three Fiber
- @react-three/drei
- Zustand para estado global
- @react-three/rapier para físicas cuando resulte adecuado

Arquitectura recomendada:

src/
  components/
  game/
  players/
  ball/
  ai/
  stadium/
  camera/
  replay/
  physics/
  animation/
  audio/
  ui/
  data/
  hooks/
  stores/
  utils/

No utilizar backend.

Todo debe ejecutarse localmente mediante:

npm install
npm run dev

---

# FILOSOFÍA DEL PROYECTO

No quiero un arcade donde todos los jugadores corran hacia el balón.

Quiero un pequeño simulador de fútbol.

La prioridad debe ser:

1. jugabilidad;
2. comportamiento colectivo;
3. física del balón;
4. controles;
5. cámara;
6. animaciones;
7. IA;
8. sistema de repetición;
9. presentación visual.

Es preferible tener gráficos sencillos y un partido convincente que gráficos espectaculares con una jugabilidad pobre.

---

# EQUIPOS

Crear inicialmente cuatro equipos:

- Real Madrid
- FC Barcelona
- Athletic Club de Bilbao
- Real Sociedad

Mostrar sus nombres en el selector de equipos.

Cada equipo tendrá:

- nombre;
- abreviatura;
- colores;
- lista de jugadores;
- dorsal;
- posición;
- atributos;
- formación inicial.

Los escudos deben ser diseños genéricos originales inspirados únicamente en los colores del club, sin copiar los escudos oficiales.

Las camisetas tampoco deben reproducir exactamente equipaciones comerciales.

---

# JUGADORES

Crear plantillas configurables mediante archivos dentro de:

src/data/teams/

Ejemplo:

realMadrid.js
barcelona.js
athletic.js
realSociedad.js

Cada jugador debe tener:

{
 id,
 name,
 number,
 position,
 speed,
 acceleration,
 passing,
 shooting,
 dribbling,
 defending,
 strength,
 stamina,
 goalkeeper
}

Utilizar nombres de jugadores reconocibles de cada club en la plantilla inicial.

Los nombres deberán aparecer:

- sobre el jugador seleccionado;
- en alineaciones;
- en sustituciones;
- en estadísticas;
- cuando marquen;
- cuando reciban tarjeta;
- en las repeticiones.

NO reproducir caras reales.

Los jugadores pueden utilizar modelos humanos genéricos diferenciados por:

- altura;
- complexión;
- pelo;
- tono de piel;
- dorsal;
- posición.

---

# CAMPO

Crear un campo reglamentario aproximadamente proporcional a:

105 x 68 metros.

Incluir:

- líneas de banda;
- líneas de fondo;
- círculo central;
- áreas;
- áreas pequeñas;
- punto de penalti;
- porterías;
- redes;
- banderines;
- banquillos;
- túnel;
- vallas publicitarias genéricas.

El terreno de juego debe tener franjas visuales de césped.

---

# ESTADIO

Crear un estadio 3D original de aproximadamente 30.000–50.000 espectadores.

No copiar ningún estadio real.

Incluir:

- cuatro gradas;
- público simplificado;
- iluminación;
- túnel;
- banquillos;
- focos;
- paneles electrónicos;
- publicidad ficticia.

El público puede utilizar instancing para mantener buen rendimiento.

El objetivo es mantener 60 FPS en un PC medio.

---

# PARTIDO

Formato inicial:

11 contra 11.

Duración configurable:

- 3 minutos;
- 5 minutos;
- 10 minutos;
- 15 minutos.

Escala temporal acelerada.

Antes del partido mostrar:

EQUIPO LOCAL

VS

EQUIPO VISITANTE

Mostrar después:

- estadio;
- alineaciones;
- formación;
- nombres de jugadores.

Después comenzar el encuentro desde el círculo central.

---

# FORMACIONES

Implementar inicialmente:

4-3-3
4-2-3-1
4-4-2

Cada jugador tendrá una posición táctica objetivo.

Ejemplo:

GK
LB
LCB
RCB
RB
DM
CM
AM
LW
RW
ST

Los jugadores sin balón deben intentar mantener su estructura táctica.

---

# IA COLECTIVA

Este punto es MUY IMPORTANTE.

No quiero que los 20 jugadores de campo persigan el balón.

Crear un sistema de roles.

Cada jugador debe evaluar continuamente:

1. posición del balón;
2. quién tiene posesión;
3. distancia al balón;
4. posición táctica;
5. posición de compañeros;
6. posición de rivales;
7. ubicación de la portería;
8. fase del juego.

Estados posibles:

IDLE
POSITIONING
SUPPORT
ATTACKING
DEFENDING
PRESSING
MARKING
INTERCEPTING
RECEIVING
DRIBBLING
PASSING
SHOOTING
RECOVERING

Solo uno o dos jugadores deben presionar directamente al poseedor.

Los demás:

- mantienen posiciones;
- cubren espacios;
- marcan;
- generan líneas de pase;
- hacen desmarques.

---

# FASES DEL EQUIPO

Crear estados colectivos:

DEFENSIVE_BLOCK
BUILD_UP
POSSESSION
COUNTER_ATTACK
HIGH_PRESS
TRANSITION_TO_ATTACK
TRANSITION_TO_DEFENCE

Ejemplo:

Si un equipo recupera el balón:

TRANSITION_TO_ATTACK

Los extremos comienzan desmarques.

El mediocentro ofrece apoyo.

Los laterales pueden avanzar.

Los centrales mantienen cobertura.

---

# IA OFENSIVA

Cuando un equipo tiene posesión:

Los jugadores cercanos deben generar triángulos de pase.

Los extremos deben:

- abrir el campo;
- realizar diagonales;
- atacar espacios.

El delantero debe:

- ofrecer apoyos;
- atacar profundidad;
- posicionarse entre centrales.

Los centrocampistas deben:

- ofrecer líneas de pase;
- cambiar orientación;
- llegar desde segunda línea.

Los laterales pueden:

- incorporarse;
- doblar al extremo;
- mantener posición dependiendo de la situación.

---

# IA DEFENSIVA

Implementar:

- bloque defensivo;
- presión;
- coberturas;
- marcaje zonal;
- interceptación.

El defensor más cercano presiona.

El segundo defensor cubre.

Los demás mantienen estructura.

La línea defensiva debe moverse colectivamente.

Evitar movimientos robóticos perfectamente sincronizados.

---

# CONTROL DEL JUGADOR

PC.

MOVIMIENTO:

WASD

o

Flechas

SPRINT:

Shift

PASE RASO:

X

PASE AL HUECO:

W

TIRO:

D

CENTRO / PASE ALTO:

A

CAMBIO DE JUGADOR:

Q

ENTRADA:

D cuando no tienes el balón

SEGUNDO DEFENSOR:

E

REGATE / MODIFICADOR:

Ctrl

PAUSA:

Escape

Permitir también gamepad.

---

# SISTEMA DE PASE

El pase no debe ir simplemente al jugador más cercano.

Calcular:

- dirección del joystick;
- potencia;
- distancia;
- posición del receptor;
- movimiento del receptor;
- presión rival;
- atributo de pase.

Implementar tres pases:

Pase corto
Pase al hueco
Pase elevado

El balón debe poder ser interceptado.

---

# SISTEMA DE TIRO

El disparo debe depender de:

- dirección;
- duración del botón;
- atributo shooting;
- distancia;
- ángulo;
- pierna;
- presión defensiva;
- velocidad del jugador.

Mantener el botón aumenta potencia.

Ejemplo:

0–0.2 segundos = disparo suave
0.2–0.6 = medio
0.6–1.0 = fuerte

Añadir pequeñas desviaciones.

No todos los tiros deben ir exactamente donde apunta el usuario.

---

# FÍSICA DEL BALÓN

El balón es probablemente el elemento más importante.

Debe tener:

- masa;
- velocidad;
- aceleración;
- gravedad;
- rebote;
- fricción;
- spin;
- resistencia.

El balón nunca debe estar simplemente pegado al pie.

Durante conducción utilizar un sistema de pequeños impulsos o targets dinámicos.

Debe poder separarse del jugador si:

- corre demasiado;
- recibe una entrada;
- cambia bruscamente de dirección;
- tiene mal control;
- recibe un pase fuerte.

---

# CONTROL DEL BALÓN

Cuando un jugador recibe un pase:

calcular calidad de control basada en:

player.dribbling
ballSpeed
bodyOrientation
pressure

Un control perfecto deja el balón cerca.

Un mal control puede dejarlo:

0.5–2 metros alejado.

---

# REGATE

Implementar:

- cambios de dirección;
- frenadas;
- aceleraciones;
- protección del balón;
- pequeños toques.

Opcional posteriormente:

- step-over;
- ruleta;
- amago;
- drag-back.

---

# PORTEROS

Los porteros deben utilizar una IA específica.

Estados:

POSITION
TRACK_BALL
SAVE
DIVE
CATCH
PUNCH
RUSH_OUT
ONE_ON_ONE
DISTRIBUTE

La posición depende de:

- balón;
- portería;
- ángulo de tiro.

Implementar:

- blocajes;
- despejes;
- paradas;
- salidas;
- uno contra uno.

Las animaciones de parada deben elegirse según trayectoria del balón.

---

# COLISIONES

Implementar colisiones entre:

- jugador/jugador;
- jugador/balón;
- balón/poste;
- balón/travesaño;
- balón/suelo.

Evitar que los jugadores se atraviesen.

Utilizar colliders simples:

capsule collider para jugadores.

sphere collider para balón.

---

# FALTAS

Detectar entradas mediante:

- velocidad;
- dirección;
- contacto;
- si toca balón antes;
- intensidad.

Generar probabilidad de:

- falta;
- amarilla;
- roja.

No hace falta un sistema arbitral extremadamente complejo inicialmente.

---

# FUERA DE JUEGO

Implementar fuera de juego.

En el momento del pase:

guardar:

- posición del receptor;
- penúltimo defensor;
- posición del balón.

Si el atacante está adelantado y participa en la jugada:

señalar fuera de juego.

---

# SAQUES

Implementar:

- saque inicial;
- saque de banda;
- córner;
- saque de puerta;
- falta;
- penalti.

---

# CÁMARA PRINCIPAL

Crear una cámara similar a una retransmisión televisiva.

Vista:

- lateral;
- elevada;
- ligeramente inclinada.

Debe seguir la zona activa del partido, no únicamente el balón.

El centro de cámara puede calcularse aproximadamente:

cameraTarget =
ballPosition * 0.65 +
controlledPlayerPosition * 0.20 +
actionCenter * 0.15

Aplicar interpolación suave.

Nunca hacer movimientos bruscos.

---

# ZOOM DINÁMICO

Alejar cámara cuando:

- el balón viaja rápidamente;
- hay contraataque;
- hay muchos jugadores dispersos.

Acercarla ligeramente cuando:

- la acción está cerca del área;
- hay uno contra uno;
- hay balón parado.

---

# SISTEMA DE REPETICIONES

ESTE SISTEMA ES ESPECIALMENTE IMPORTANTE.

Quiero un sistema de replay parecido al de una retransmisión deportiva.

Debe poder reproducir los últimos:

15–20 segundos.

NO volver a simular la jugada.

Guardar continuamente snapshots del estado del partido.

Crear:

ReplayBuffer

Registrar aproximadamente 20–30 snapshots por segundo.

Cada snapshot debe incluir:

timestamp

ball:
  position
  rotation
  velocity

players:
  id
  position
  rotation
  animation
  animationTime

Guardar alrededor de:

20 segundos.

Con 22 jugadores debe seguir siendo razonablemente eficiente.

Utilizar un ring buffer para evitar crecimiento ilimitado de memoria.

---

# ACTIVADORES DE REPETICIÓN

Crear automáticamente replay cuando ocurre:

GOAL
SHOT_ON_POST
GREAT_SAVE
PENALTY
RED_CARD

Los goles siempre generan replay.

---

# REPETICIÓN DE GOL

Después del gol:

1. detener juego;
2. mostrar celebración durante 2–3 segundos;
3. transición visual;
4. iniciar replay.

Mostrar:

REPETICIÓN

en una esquina.

---

# MULTICÁMARA DEL REPLAY

ESTE PUNTO ES FUNDAMENTAL.

Una repetición de gol debe mostrar entre 2 y 4 cámaras diferentes.

Ejemplo:

TOMA 1
cámara televisiva.

TOMA 2
cámara detrás del jugador que dispara.

TOMA 3
cámara cercana lateral.

TOMA 4
cámara situada detrás de la portería.

Cada toma puede durar entre:

2 y 4 segundos.

---

# CÁMARAS DE REPETICIÓN

Crear:

BroadcastReplayCamera
PlayerReplayCamera
GoalReplayCamera
SidelineReplayCamera
OrbitReplayCamera

---

# CÁMARA DETRÁS DEL TIRADOR

Situarla aproximadamente:

2–4 metros detrás
1.5–2 metros elevada.

Orientada hacia:

balón + portería.

Debe permitir ver claramente:

- golpeo;
- trayectoria;
- portero;
- entrada del balón.

---

# CÁMARA DE PORTERÍA

Situarla:

detrás de la portería.

Orientar hacia el jugador que dispara.

Muy útil para tiros desde fuera del área.

---

# CÁMARA CINEMÁTICA

Crear una cámara dinámica que pueda interpolar entre puntos.

Ejemplo:

cameraPosition = lerp(startCamera, endCamera, smoothstep(t))

Debe seguir el balón o jugador protagonista.

---

# CÁMARA LENTA

En una de las tomas:

reproducir a:

0.35x – 0.5x

Especialmente durante:

- contacto pie/balón;
- parada;
- llegada del balón a portería.

---

# SCRUBBER DE REPETICIÓN

Después de un gol permitir opcionalmente:

← retroceder
→ avanzar
Space pausa

Mostrar timeline inferior.

Ejemplo:

|----------●---------|

Permitir:

0.25x
0.5x
1x

---

# REPETICIÓN MANUAL

Desde el menú de pausa:

REPETICIÓN

El jugador puede revisar aproximadamente los últimos 20 segundos.

Permitir cambiar cámara con:

C

Cámaras:

TV
Jugador
Balón
Portería
Libre

---

# CÁMARA LIBRE

Durante una repetición pausada:

WASD = mover cámara

ratón = rotar

rueda = zoom

Esto permitirá estudiar la jugada desde cualquier perspectiva.

---

# CELEBRACIONES

Después del gol:

el goleador corre durante unos segundos.

Compañeros cercanos pueden acercarse.

Mostrar overlay:

GOOOL

Nombre del goleador

Minuto

Ejemplo:

GOOOL

VINÍCIUS JR.
67'

Después comenzar replay.

---

# MARCADOR

Parte superior de pantalla.

Ejemplo:

RMA  2 - 1  BAR
        67:34

Mostrar:

- abreviaturas;
- goles;
- reloj.

---

# HUD DEL JUGADOR

Cuando controlamos un jugador:

mostrar su nombre discretamente cerca de la parte inferior.

Ejemplo:

10
MODRIĆ

Sobre el terreno puede aparecer un pequeño indicador bajo el jugador seleccionado.

---

# RADAR

Crear minimapa inferior.

Representar:

equipo local = círculos claros
equipo visitante = círculos oscuros
balón = punto destacado

Debe permitir entender rápidamente la posición de todos los jugadores.

---

# NOMBRES SOBRE JUGADORES

El jugador controlado debe mostrar:

NOMBRE

Ejemplo:

NICO WILLIAMS

No mostrar permanentemente los 22 nombres porque saturaría visualmente.

Cuando se selecciona otro jugador:

actualizar inmediatamente.

En replays puede mostrarse el nombre del protagonista.

---

# ANIMACIONES

Estados:

idle
walk
jog
run
sprint
turn
pass
shoot
cross
header
tackle
slide
receive
celebrate
fall
goalkeeperIdle
goalkeeperDive
goalkeeperCatch

Usar animation blending.

Nunca cambiar instantáneamente de animación.

Ejemplo:

walk -> jog -> run -> sprint

mediante crossfade.

---

# MOVIMIENTO

Los jugadores no deben poder cambiar 180 grados instantáneamente.

Implementar:

- aceleración;
- desaceleración;
- velocidad angular;
- inercia.

Ejemplo:

speed = lerp(speed, targetSpeed, acceleration * delta)

rotation = rotateTowards(rotation, targetRotation, turnSpeed * delta)

---

# ATRIBUTOS

Escala 1–100.

PACE
ACCELERATION
PASSING
SHOOTING
DRIBBLING
DEFENDING
STRENGTH
STAMINA

Deben tener consecuencias perceptibles.

Un jugador rápido debe ganar metros.

Un buen pasador debe cometer menos errores.

Un delantero con buen tiro debe tener más precisión.

---

# FATIGA

Implementar stamina.

Sprint consume energía.

Con poca energía:

- menor velocidad;
- menor aceleración;
- menor precisión;
- recuperación defensiva más lenta.

---

# EVENTOS DEL PARTIDO

Crear EventBus.

Eventos:

MATCH_START
KICKOFF
PASS
SHOT
SAVE
FOUL
YELLOW_CARD
RED_CARD
OFFSIDE
CORNER
GOAL_KICK
THROW_IN
GOAL
HALF_TIME
MATCH_END

ReplayManager debe escuchar:

GOAL
SHOT
SAVE

---

# ESTADÍSTICAS

Registrar:

posesión
tiros
tiros a puerta
pases
pases completados
faltas
córners
tarjetas
paradas

Pantalla de descanso y final.

---

# AUDIO

Implementar sonidos originales/genéricos:

- golpeo balón;
- poste;
- red;
- silbato;
- ambiente estadio;
- reacción público;
- gol.

El público debe aumentar intensidad cuando:

- un atacante entra en área;
- hay disparo;
- hay contraataque;
- hay gol.

---

# MENÚ PRINCIPAL

Diseño moderno y limpio.

Opciones:

PARTIDO RÁPIDO
CONFIGURACIÓN
CONTROLES

Al pulsar PARTIDO RÁPIDO:

SELECCIONAR LOCAL

Real Madrid
Barcelona
Athletic Club
Real Sociedad

Después:

SELECCIONAR VISITANTE.

---

# PANTALLA PREPARTIDO

Mostrar:

REAL MADRID

VS

ATHLETIC CLUB

Formaciones gráficas.

Botón:

JUGAR PARTIDO

---

# PAUSA

Menú:

CONTINUAR
REPETICIÓN
ESTADÍSTICAS
CONTROLES
ABANDONAR PARTIDO

---

# INTERFAZ

Debe parecer un videojuego profesional.

No una aplicación empresarial ni un dashboard.

Utilizar:

- overlays;
- transiciones;
- animaciones;
- tipografía deportiva;
- paneles semitransparentes.

Minimizar la cantidad de paneles visibles durante el juego.

---

# RENDIMIENTO

Objetivo:

60 FPS.

Usar:

- InstancedMesh para público;
- geometrías simplificadas;
- pooling;
- memoización;
- evitar React state para actualizaciones frame-by-frame.

Las posiciones de jugadores deben actualizarse mediante refs.

NO ejecutar:

setState()

60 veces por segundo.

Utilizar:

useFrame()

para lógica de renderizado.

---

# GAME LOOP

Implementar game loop central.

Orden recomendado:

1. input;
2. player AI;
3. team AI;
4. ball physics;
5. collisions;
6. rules;
7. events;
8. replay recording;
9. camera;
10. rendering.

---

# ARQUITECTURA DE ESTADO

Crear Zustand:

useGameStore
useMatchStore
useTeamStore
useReplayStore
useSettingsStore

Pero los datos de alta frecuencia:

position
rotation
velocity

NO deben mantenerse directamente en Zustand si eso provoca rerenders.

---

# DEBUG MODE

Añadir:

F2

para activar DEBUG.

Mostrar:

- FPS;
- estado IA;
- target táctico;
- collider;
- trayectoria del balón;
- jugador seleccionado;
- posición;
- velocidad;
- replay buffer.

Esto será muy importante para desarrollar posteriormente el juego.

---

# PRIORIDAD DE DESARROLLO

NO intentes construir todo simultáneamente.

FASE 1

Crear:

- campo;
- estadio simple;
- 22 jugadores;
- balón;
- cámara;
- movimiento.

FASE 2

Implementar:

- control;
- pase;
- tiro;
- cambio jugador.

FASE 3

Implementar:

- IA básica;
- formación;
- defensa;
- ataque.

FASE 4

Implementar:

- goles;
- fueras;
- saques;
- córners;
- marcador.

FASE 5

Implementar ReplayBuffer.

FASE 6

Implementar repetición multicámara.

FASE 7

Implementar:

- animaciones;
- estadísticas;
- faltas;
- tarjetas;
- mejoras visuales.

---

# PRIMER MILESTONE JUGABLE

Antes de implementar detalles secundarios necesito conseguir:

Real Madrid vs Barcelona.

11 contra 11.

Que pueda:

- mover jugador;
- pasar;
- tirar;
- marcar;
- defender;
- cambiar jugador.

La IA debe mantener aproximadamente sus posiciones.

El balón debe tener física independiente.

Debe existir:

- marcador;
- reloj;
- detección de gol.

Cuando haya gol:

quiero ver automáticamente una repetición de aproximadamente 8–12 segundos desde varias cámaras.

Este milestone debe ser completamente funcional antes de continuar.

---

# CRITERIOS DE CALIDAD DEL REPLAY

Una repetición NO puede consistir simplemente en cambiar la cámara mientras el partido continúa.

Debe reproducirse el estado histórico guardado.

Debe ser posible ver exactamente:

- dónde estaba cada jugador;
- posición del balón;
- trayectoria;
- animación;
- orientación.

La misma jugada debe poder reproducirse desde infinitas posiciones de cámara.

Por eso debes separar estrictamente:

MATCH SIMULATION

de

REPLAY PLAYBACK.

Durante replay:

la simulación del partido queda pausada.

ReplayManager controla las posiciones mediante snapshots.

Al terminar:

restaurar estado actual del partido.

---

# DETALLE IMPORTANTE: REPLAY INTERPOLATION

Como no guardaremos 60 snapshots por segundo, interpolar entre snapshots.

Para posición:

lerp(positionA, positionB, alpha)

Para rotación:

slerp(rotationA, rotationB, alpha)

Así podremos guardar 20–30 estados por segundo pero reproducir visualmente a 60 FPS.

---

# DIRECTOR DE REPETICIONES

Crear un sistema:

ReplayDirector

Su función es analizar el evento y seleccionar cámaras.

Ejemplo:

Gol desde fuera del área:

1. BroadcastCamera
2. ShooterCamera
3. GoalCamera
4. SlowMotionCamera

Gol después de centro:

1. BroadcastCamera
2. SidelineCamera
3. HeaderCamera
4. GoalCamera

Uno contra uno:

1. BroadcastCamera
2. AttackerCamera
3. GoalkeeperCamera
4. BehindGoalCamera

De esta manera las repeticiones no deben ser siempre iguales.

---

# SISTEMA DE MOMENTOS IMPORTANTES

Crear un EventImportanceScore.

Ejemplo:

gol = 100
penalti = 90
tiro poste = 75
gran parada = 70
tiro cercano = 50
falta = 20

Si score > 65:

guardar Highlight.

Esto permitirá posteriormente crear:

RESUMEN DEL PARTIDO.

---

# HIGHLIGHTS AL FINAL

Después del partido mostrar:

RESULTADO

REAL MADRID 3
ATHLETIC CLUB 2

ESTADÍSTICAS

y:

MEJORES JUGADAS

Mostrar mini lista:

12' Gol
34' Gran parada
53' Gol
72' Poste
88' Gol

Permitir seleccionar cualquier jugada y verla nuevamente con ReplayDirector.

---

# DISEÑO EXTENSIBLE

La arquitectura debe permitir posteriormente incorporar:

- ligas;
- torneos;
- Champions ficticia;
- temporada;
- fichajes;
- estadísticas individuales;
- lesiones;
- sustituciones;
- tácticas;
- dificultad;
- multijugador;
- comentaristas;
- modo carrera.

No implementar todavía estas características si perjudican el milestone jugable.

---

# IMPORTANTE SOBRE ASSETS

No utilizar recursos protegidos extraídos de PES, FIFA, EA Sports FC o eFootball.

No copiar:

- código;
- texturas;
- música;
- HUD;
- modelos;
- estadios;
- comentarios;
- animaciones propietarias.

Crear assets propios o utilizar recursos compatibles con su licencia.

Para los jugadores reales utilizar inicialmente personajes genéricos y nombres textuales, sin intentar reproducir exactamente sus caras.

---

# METODOLOGÍA DE DESARROLLO

Trabaja de manera incremental.

No escribas miles de líneas de código sin verificar el resultado.

Después de cada fase:

1. ejecutar proyecto;
2. comprobar errores;
3. comprobar consola;
4. comprobar jugabilidad;
5. corregir bugs;
6. continuar.

Priorizar siempre una versión funcional.

Nunca sustituir una característica difícil por texto indicando:

"esto se implementará posteriormente".

Si una funcionalidad pertenece al milestone actual, debe implementarse realmente.

---

# OBJETIVO FINAL DE EXPERIENCIA

Cuando abra el navegador quiero tener la sensación de estar ejecutando un pequeño videojuego de fútbol.

Flujo esperado:

MENÚ

↓

REAL MADRID
BARCELONA
ATHLETIC CLUB
REAL SOCIEDAD

↓

SELECCIÓN DE EQUIPOS

↓

ALINEACIONES

↓

ENTRADA AL ESTADIO

↓

PARTIDO

↓

JUGADA

↓

DISPARO

↓

GOL

↓

CELEBRACIÓN

↓

REPETICIÓN TV

↓

REPETICIÓN DETRÁS DEL TIRADOR

↓

CÁMARA LENTA

↓

CÁMARA DETRÁS DE LA PORTERÍA

↓

VUELTA AL CENTRO DEL CAMPO

↓

CONTINÚA EL PARTIDO

El partido debe sentirse fluido, reconocible como fútbol y divertido.

La prioridad absoluta no es copiar PES visualmente.

La prioridad es reproducir aquello que hace convincente un simulador de fútbol:

- control responsivo;
- libertad del balón;
- jugadores que ocupan espacios;
- pases naturales;
- desmarques;
- presión;
- defensa organizada;
- disparos satisfactorios;
- cámara televisiva;
- ambientación de estadio;
- y, especialmente, repeticiones espectaculares multicámara.