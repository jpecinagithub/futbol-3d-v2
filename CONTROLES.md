# CONTROLES — FÚTBOL 3D

Toda la UI del juego está en español. Los controles también se muestran en el
menú de pausa (tecla `Esc` durante el partido).

## Teclado (PC): dos esquemas

Se elige en **Pausa → Controles** (se guarda la preferencia). Las flechas
mueven en ambos esquemas. Cada acción se puede reasignar (clic en la tecla
y pulsar la nueva; **Esc** cancela; si la tecla estaba ocupada, se
intercambian para no dejar conflictos).

### IJKL (clásico)

| Tecla | Acción |
|---|---|
| `IJKL` / Flechas | Moverse (relativo a cámara broadcast: `I` = atacar, hacia arriba en pantalla) |
| `S` / `Shift` | Correr. Consume stamina; si baja de 25, pierdes punta y calidad técnica |
| `A` (con balón) | Toque: pase raso al compañero (siempre va a un compañero). **Mantener** >0,35 s: cargar tiro; **soltar**: disparar. Si hay carga en curso, pulsar pase la **cancela** |
| `A` (sin balón) | Entrada / presión hacia la dirección pulsada (o hacia el balón) |
| `Q` | Cambiar de jugador |
| `X` | Pase elevado / bombeado al compañero (por encima de la defensa) |
| `C` | Pase al hueco (al espacio por delante del desmarque) |
| `Z` | Ciclar cámara: TV → cercana → lejos (la elección se guarda) |
| `R` | Mostrar / ocultar el radar (se guarda) |
| `H` | Halo del balón para verlo mejor (se guarda) |
| `Tab` | Mostrar / ocultar las estadísticas del partido |
| `Esc` | Pausa |

### WASD (alternativo, sin conflictos)

| Tecla | Acción |
|---|---|
| `WASD` / Flechas | Moverse (`W` = atacar). La `S` mueve: **Shift** corre (se acabó el conflicto S correr/bajar) |
| `Shift` | Correr (consume stamina) |
| `E` (con balón) | Pase raso directo al compañero. Si hay un tiro cargando, lo **cancela** |
| `Espacio` (con balón) | **Mantener**: cargar tiro; **soltar**: disparar |
| `F` (sin balón) | Entrada dedicada (con balón no hace nada) |
| `Q` | Cambiar de jugador |
| `X` | Pase elevado / bombeado (igual que en IJKL) |
| `C` | Pase al hueco (igual que en IJKL) |
| Resto (`Z`, `R`, `H`, `Tab`, `Esc`) | Igual que en IJKL |

A balón parado se apunta con el movimiento del esquema activo y se ejecuta
con `A` (IJKL) o `E` (WASD); en libres y penaltis, mantener la tecla de tiro
carga el disparo. Con el portero en un penalti en contra, la tecla de
entrada (`A`/`F`) es lanzarse.

## Profundidad (Fase 4)

- **Pase con potencia**: en WASD, mantener `E` carga el pase (1x–1,6x, sale
  al soltar; la barra se vuelve cian). Con sprint, pase **tenso** (1,35x).
- **Tiros**: carga corta sin sprint = **colocado** (raso y preciso); con
  sprint = **potente** (+25 % velocidad, más riesgo); `C` durante la carga =
  **vaselina** (parábola alta).
- **Primer toque orientado**: el control sale hacia tu dirección actual, con
  0,6 s de protección ante disputas suaves (las entradas sí cuentan).
- **Defensa**: anillo blanco = alcance de la entrada. En mando, golpe seco
  del **stick derecho** cambia al compañero en esa dirección.
- **Stamina**: esprintar cuesta 8,5/s; trotar recupera 4/s y parado 6,5/s.
  La IA fundida (<25) no esprinta.

## Profundidad (Fase 4)

- **Pase con potencia**: en WASD, mantener `E` carga el pase (1x–1,6x, sale
  al soltar; la barra se vuelve cian). Con sprint, pase **tenso** (1,35x).
- **Tiros**: carga corta sin sprint = **colocado** (raso y preciso); con
  sprint = **potente** (+25 % velocidad, más riesgo); `C` durante la carga =
  **vaselina** (parábola alta).
- **Primer toque orientado**: el control sale hacia tu dirección actual, con
  0,6 s de protección ante disputas suaves (las entradas sí cuentan).
- **Defensa**: anillo blanco = alcance de la entrada. En mando, golpe seco
  del **stick derecho** cambia al compañero en esa dirección.
- **Stamina**: esprintar cuesta 8,5/s; trotar recupera 4/s y parado 6,5/s.
  La IA fundida (<25) no esprinta.

## Decisiones de diseño: la tecla A

`A` es la única tecla de acción (además de `Q`):

- **Con balón**, un toque dispara el pase raso al compañero mejor colocado
  (y si no hay nadie en la dirección del movimiento, al compañero más
  cercano: el pase nunca se tira al vacío). Si se **mantiene** más de 0,35 s,
  empieza la carga de tiro; al soltar, se golpea. Mientras se carga, `A`
  **no** mueve (usa `IJKL`/flechas para apuntar).
- **Sin balón**, pulsar `A` hace la entrada inmediatamente.
- **A balón parado**: apuntar con `IJKL`/flechas; `A` ejecuta el saque
  (córner por alto, resto raso); en libres y penaltis, mantener `A` carga
  el tiro. Con el portero en un penalti en contra, `A` es lanzarse.

## Mando (Gamepad API)

Se detecta automáticamente (el HUD muestra ⌨ o 🎮 según el último usado).
Zona muerta y sensibilidad del stick ajustables en Pausa → Controles.

| Control | Acción |
|---|---|
| Stick izquierdo | Moverse |
| `RT` | Sprint |
| `A` | Pase raso |
| `Y` | Pase al hueco |
| `B` | Tiro (mantener para cargar, soltar para golpear) |
| `X` | Centro / pase alto |
| `LB` | Cambiar de jugador |
| Stick derecho (golpe) | Cambiar al compañero en esa dirección |
| `RB` (mantener) | Segundo defensor |
| `LT` (mantener) | Regate |

## Sistemas de juego (resumen)

- **Radar**: minimapa abajo a la izquierda con todos los jugadores (colores
  de cada equipo), balón destacado y anillo en el controlado. `R` lo oculta.
- **Vista previa del pase**: con balón, un anillo cian marca al compañero
  que recibiría el pase si pulsas `A` ahora. En defensa, un anillo blanco
  tenue marca a quién pasarías a controlar con `Q`.
- **Balón**: sombra en el césped siempre; si se eleva (>1,4 m) aparece una
  línea vertical con anillo pulsante en el suelo; `H` añade un halo.
- **Stamina**: barra bajo la tarjeta del controlado; si baja de 25 aparece
  el aviso «¡FUNDIDO!» (más urgente si sigues esprintando).

- **Pases** (3 tipos, interceptables): el balón puede cortarlo cualquier
  jugador cuyo cilindro intercepte la trayectoria con el balón bajo (<1,25 m)
  y a velocidad controlable. Flecha azul en el suelo (0,4 s) marca la dirección.
- **Tiro**: la dispersión depende del `shooting` del tirador, la distancia, el
  ángulo, la presión defensiva (<3 m), si va en carrera y la stamina. La
  elevación (raso/medio/alto) la marca la carga, con aleatoriedad controlada.
- **Control**: al recibir, la calidad del primer toque depende del `dribbling`,
  la velocidad del balón, la orientación del cuerpo y la presión. Un mal
  control despide el balón 0,5–2 m.
- **Conducción**: toques dinámicos, nunca pegada al pie. Esprintar con balón
  por encima del umbral, girar >120° a alta velocidad o tener poco `dribbling`
  produce toques largos que se pueden perder.
- **Robo**: si un rival toca tu balón en conducción con buen timing, te lo
  puede llevar o desviar. Acercarse sin barrer también permite disputar.
- **Entradas**: balón antes que jugador = robo limpio (falta improbable);
  jugador antes que balón o con mucha intensidad = falta (pitido, 1,5 s de
  pausa, aviso "Falta de X"; la Fase D añadirá tarjetas y libres).
- **Cambio de jugador**: con dirección pulsada elige al compañero más
  alineado con ella; sin dirección, al más cercano al balón.
- **Stamina**: barra fina bajo la etiqueta del controlado. <25 = fundido.
