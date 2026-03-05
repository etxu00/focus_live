// Función auxiliar para seleccionar elementos
function $(selector) {
 return document.querySelector(selector);
}

// Elementos del DOM
const $btnStart = document.querySelector('#btn_start')
const $code = document.querySelector('code')
const $inputs = document.querySelectorAll('input, select')
const $selects = document.querySelectorAll('select')

// Elementos SVG
const $svg = $('#svg')
const $svgGroup = $('#svg_group')
const $svgProgress = $('#svg_progress')
const $svgText = $('#svg_text')
const $svgTrack = $('#svg_track')

// Elementos de formulario
const $inputColor = $('#input_color')
const $inputDuracion = $('#input_duracion')
const $inputEscalaDelTexto = $('#input_escala_del_texto')
const $inputGrosorBarra = $('#input_grosor_barra')
const $inputIntensidadResplandor = $('#input_intensidad_resplandor')
const $inputMargenInterno = $('#input_margen_interno')
const $inputMostrarDecimales = $('#input_mostrar_decimales')
const $inputOcultarTexto = $('#input_ocultar_texto')
const $inputSeparacion = $('#input_separacion')
const $selectAlineacionHorizontal = $('#select_alineacion_horizontal')
const $selectPosicionVertical = $('#select_posicion_vertical')
const $selectPuntoInicio = $('#select_punto_inicio')
const $selectSentidoRotacion = $('#select_sentido_rotacion')
const $selectTipoDeBorde = $('#select_tipo_de_borde')
const $selectUnidad = $('#select_unidad')
const $selectVisualization = $('#select_visualization')

// Datos del bloque de tiempo
const bloqueDeTiempo = {
 nombre: "",
 descripcion: "",
 configuracion: {
   aspecto: "Circular",
   configuracion_general: {
     diseño: {
       alto: 0,
       color: "",
       escala_del_texto: 0,
       grosor_barra: 0,
       intensidad_resplandor: 0,
       mostrar_decimales: false,
       ocultar_texto: false,
       tipo_de_borde: "Redondo"
     }
   },
   configuracion_lineal: {
     visualizacion: {
       alineacion_horizontal: "Centro",
       posicion_vertical: "Abajo",
       separacion: 0
     }
   },
   cuenta_regresiva: false,
   duracion: 0,
   icono: "",
   tiempo_restante: 0,
   unidad: "Segundos",
   visualizacion: "Tiempo",
   visualizar_decimales: false,
   configuracion_circular: {
     visualizacion: {
       completo: false,
       margen_interno: 0,
       punto_de_inicio: "Arriba",
       sentido_rotacion: "Derecha",
     }
   }
 }
}

// Funciones matemáticas
const basePathY = 125  // Y del centro de la línea
const svgCenter = 175  // Centro del SVG
let R = 40  // R es el radio del círculo
let L = 2 * Math.PI * R  // L es la longitud del arco
let cx = svgCenter - L / 2  // X del centro de la línea

// Curvas de Aceleración (Easings)
const easings = {
  linear: timeProgress => timeProgress,
  easeIn: timeProgress => timeProgress * timeProgress,
  easeOut: timeProgress => timeProgress * (2 - timeProgress),
  easeInOut: timeProgress => timeProgress < 0.5 ? 2 * timeProgress * timeProgress : -1 + (4 - 2 * timeProgress) * timeProgress
};

// Variables de Estado
let morphT = 0 // Progreso de la morph (0-1)
let progressP = 0 // Progreso de la barra (0-1)
let rawT = 0 // Tiempo puro de animación 0 a 1 (antes del easing)
let activeTotalMs = 0 // Tiempo total activo en milisegundos

let morphAnimId;
let progressAnimId;
let progressStartTime = null;
let loopTimeout = null;

function applySharedStyles() {
 const color = $inputColor.value;
 const glow = $inputIntensidadResplandor.value;
 const strokeWidth = $inputGrosorBarra.value;
 const strokeLinecap = $selectTipoDeBorde.value;

 $svgProgress.style.stroke = color;
 $svgProgress.style.filter = glow > 0 ? `drop-shadow(0 0 ${glow}px ${color})` : 'none';

 $svgTrack.style.strokeWidth = strokeWidth;
 $svgProgress.style.strokeWidth = strokeWidth;
 $svgTrack.style.strokeLinecap = strokeLinecap;
 $svgProgress.style.strokeLinecap = strokeLinecap;

 $svgText.style.opacity = $inputOcultarTexto.checked ? '0' : '1';

 /**
  * TODO:
  * El color del texto también puede coincidir o quedarse blanco. Lo dejamos blanco para legibilidad,
  * pero podrías cambiar `mainText.style.fill = color;` si lo prefieres.
  */
}

// Función para verificar si una propiedad anidada existe en el objeto
function hasNestedProperty(obj, path) {
 return path.split('.').every(key => {
   if (obj && typeof obj === 'object' && key in obj) {
     obj = obj[key]
     return true
   }
   return false
 })
}

// Función para establecer el valor de una propiedad anidada
function setNestedProperty(obj, path, value) {
 path.split('.').reduce((current, key, index, keys) => {
   if (index === keys.length - 1) {
     current[key] = value
   }
   return current[key]
 }, obj)
}

function updateData(event) {
 if (!event) {
   return
 }
 const type = event.target.type
 const name = event.target.name
 const value = event.target.value
 if (name && hasNestedProperty(bloqueDeTiempo, name)) {
   setNestedProperty(bloqueDeTiempo, name, type === 'checkbox' ? event.target.checked : value)
   $code.textContent = JSON.stringify(bloqueDeTiempo, null, 2)
 }
}

function getPathD(t) {
 const l = t * L;
 const cy = basePathY - R;

 if (t === 0) {
   // Modo línea: path lineal horizontal
   return `M ${cx} ${basePathY} L ${cx + L} ${basePathY}`;
 } else if (t === 1) {
   // Modo círculo: path circular completo
   return `M ${cx} ${cy}
           A ${R} ${R} 0 1 1 ${cx - 0.01} ${cy}`;
 } else {
   // Modo intermedio: transición entre línea y círculo
   return `M ${cx} ${basePathY}
           L ${cx + l} ${basePathY}
           A ${R} ${R} 0 ${l > L / 2 ? 1 : 0} 1 ${cx + l * Math.cos(-Math.PI * l / L)} ${cy + l * Math.sin(-Math.PI * l / L)}`;
 }
}

function getTotalMsFromInputs() {
 const val = parseFloat($inputDuracion.value) || 0;
 return val * parseFloat($selectUnidad.value) * 1000;
}

function updateMorphRender() {
 // Configuraciones de Círculo
 const cMarginVal = parseInt($inputMargenInterno.value)
 const startAngleDeg = parseInt($selectPuntoInicio.value) || 0

 // Configuraciones de Línea
 const lAlignVal = $selectAlineacionHorizontal.value
 const lPosVal = $selectPosicionVertical.value
 const lSpacingVal = parseInt($inputSeparacion.value)

 // Dinámica de dimensiones
 R = 40 + cMarginVal
 L = 2 * Math.PI * R
 cx = svgCenter - L / 2
 const cy = basePathY - R

 // Trazado
 const d = getPathD(morphT)
 $svgTrack.setAttribute('d', d)
 $svgProgress.setAttribute('d', d)

 // Manejo del Punto de Inicio
 const currentAngle = startAngleDeg * (1 - morphT)
 $svgGroup.setAttribute('transform', `rotate(${currentAngle}, ${cx}, ${cy})`)

 // Transformación CSS para Centrado Constante
 const requiredShift = svgCenter - cx
 const currentShift = (1 - morphT) * requiredShift
 $svg.style.transform = `translateX(${currentShift}px)`

 // Tipografía Base y Escala
 const scale = parseInt($inputEscalaDelTexto.value) / 100
 const baseX = cx
 const baseY = basePathY - R + 2
 const baseFontSize = 28 * scale

 let targetX = cx + L / 2
 if (lAlignVal === 'Izquierda') targetX = cx + 35
 if (lAlignVal === 'Derecha') targetX = cx + L - 35

 let targetY = basePathY - lSpacingVal
 if (lPosVal === 'Arriba') targetY = basePathY + lSpacingVal + 5

 const targetFontSize = 22 * scale

 const textX = baseX + morphT * (targetX - baseX)
 const textY = baseY + morphT * (targetY - baseY)
 const fontSize = baseFontSize + morphT * (targetFontSize - baseFontSize)

 $svgText.setAttribute('x', textX)
 $svgText.setAttribute('y', textY)
 $svgText.setAttribute('font-size', fontSize)

 updateProgressRender()
}

/**
 * Actualiza el título de la página     
 * Actualiza el título de la página con el tiempo transcurrido
 * @returns {void}
 */
function updateTitileTag() {
  const showDec = $inputMostrarDecimales.checked
  let title = ''

  if ($selectVisualization.value === 'Porcentaje') {
    const val = progressP * 100
    title = (showDec ? val.toFixed(1) : Math.floor(val)) + '%'
  } else {
    const totalSecs = (activeTotalMs > 0 ? activeTotalMs : getTotalMsFromInputs()) / 1000
    const val = progressP * totalSecs
    title = (showDec ? val.toFixed(1) : Math.floor(val)) + 's'
  }

  document.title = title
}

function updateProgressRender() {
  const dir = parseInt($selectSentidoRotacion.value)

  $svgProgress.style.opacity = progressP === 0 ? 0 : 1

  const targetSegStart = (dir === 1) ? 0 : (L - progressP * L) // Posición inicial del segmento
  const currentSegStart = targetSegStart * (1 - morphT) // Posición actual del segmento

  $svgProgress.style.strokeDasharray = `${progressP * L} ${L}`
  $svgProgress.style.strokeDashoffset = -currentSegStart

  const showDec = $inputMostrarDecimales.checked

  if ($selectVisualization.value === 'Porcentaje') {
    const val = progressP * 100
    $svgText.textContent = (showDec ? val.toFixed(1) : Math.floor(val)) + '%'
  } else {
    const totalSecs = (activeTotalMs > 0 ? activeTotalMs : getTotalMsFromInputs()) / 1000
    const val = progressP * totalSecs

    $svgText.textContent = (showDec ? val.toFixed(1) : Math.floor(val)) + 's'
  }
}

/**
 * INICIAR TEMPORIZADOR
 */

function startTimer() {
  $btnStart.textContent = 'Iniciando...'
  $btnStart.disabled = true

  const duration = $inputDuracion.value

  if (!duration) {
    $btnStart.disabled = false
    return
  }

  clearTimeout(loopTimeout)
  activeTotalMs = getTotalMsFromInputs()

  cancelAnimationFrame(progressAnimId)
  progressStartTime = null
  $btnStart.disabled = true

  const selectedEasing = easings.linear;

  const animateProgress = timestamp => {
    if (!progressStartTime) {
      progressStartTime = timestamp
    }

    const elapsed = timestamp - progressStartTime
    rawT = Math.min(elapsed / activeTotalMs, 1);
    progressP = selectedEasing(rawT); // Aplica la aceleración

    updateProgressRender()
    updateTitileTag()

    if (rawT < 1) {
      progressAnimId = requestAnimationFrame(animateProgress);
    } else {
      $btnStart.style.filter = '';
      
      if (loopAnim.checked) {
        $btnStart.textContent = 'Reiniciando...';
        // Esperar un segundo y reiniciar el loop
        loopTimeout = setTimeout(() => {
          if (loopAnim.checked) startBtn.click();
        }, 1000);
      } else {
        startBtn.disabled = false;
        startBtn.textContent = 'Reiniciar Animación';
        activeTotalMs = 0; 
      }
    }
  }
  progressAnimId = requestAnimationFrame(animateProgress)
}

document.addEventListener("DOMContentLoaded", () => {
 applySharedStyles()
 updateMorphRender()

 $code.textContent = JSON.stringify(bloqueDeTiempo, null, 2)

 $inputs.forEach($input => $input.addEventListener('input', event => updateData(event)))
 $selects.forEach($select => $select.addEventListener('input', event => updateData(event)))
 $btnStart.addEventListener('click', () => startTimer())
})
