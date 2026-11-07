/**
 * Animación cinemática no destructiva de las cuatro ruedas.
 *
 * El GLB original contiene el grupo `wheel_rf_dummy` con exactamente cuatro
 * hijos directos: conjuntos de rueda completos centrados en sus propios ejes.
 * Importante: GLTFLoader puede normalizar los nombres con puntos, por ejemplo
 * `bolt_wheel.002` a `bolt_wheel_002`. Por ello NUNCA se buscan sufijos `.002`.
 * Se identifican las ruedas por jerarquía y posición, no por nombre exacto.
 *
 * Coordenadas del grupo original: X lateral (+X lado izquierdo), Y longitudinal,
 * Z altura; el eje local de giro es X. Se restaura la transformación original
 * al salir de Driving Simulator, sin reparentar ni alterar materiales o geometría.
 */
export class WheelRig {
  constructor(car, radiusM=0.31) {
    if (!car || !(radiusM > 0) || !Number.isFinite(radiusM)) {
      throw new Error('Configuración de ruedas inválida');
    }
    const group = car.getObjectByName?.('wheel_rf_dummy');
    if (!group) {
      throw new Error('No se encontró el conjunto de ruedas wheel_rf_dummy en el GLB.');
    }
    // Los cuatro conjuntos son hijos directos del grupo, cada uno con sus
    // propias mallas y un pivote físico preexistente.
    const wheels = group.children.filter(node =>
      node && node.quaternion && node.position && typeof node.rotateX === 'function' &&
      node.children?.length > 0 && /^bolt_wheel(?:[._]\d+)?$/.test(node.name || '')
    );
    // Algunos exportadores cambian todos los nombres: el grupo sigue siendo
    // inequívoco si contiene cuatro hijos, cada uno con geometría anidada.
    const roots = wheels.length === 4 ? wheels :
      (group.children.length === 4 && group.children.every(node =>
        node.quaternion && node.position && typeof node.rotateX === 'function' && node.children?.length > 0
      ) ? [...group.children] : []);
    if (roots.length !== 4) {
      throw new Error(`Se encontraron ${roots.length} de 4 ruedas en el conjunto 3D; verifica el archivo GLB.`);
    }
    // El propio GLB distingue los lados por la coordenada lateral X.
    const left = roots.filter(node => node.position.x > 0.1);
    const right = roots.filter(node => node.position.x < -0.1);
    if (left.length !== 2 || right.length !== 2) {
      throw new Error('Las ruedas no están distribuidas en dos lados como se espera en el GLB original.');
    }
    this.radiusM = radiusM;
    this.wheels = roots.map(node => ({
      node,
      name: node.name,
      side: node.position.x > 0 ? 'izquierda' : 'derecha',
      sense: node.position.x > 0 ? 1 : -1,
      initialQuaternion: node.quaternion.clone(),
      initialParent: node.parent,
      initialPosition: node.position.clone?.(),
    }));
  }
  roll(distanceM) {
    if (!Number.isFinite(distanceM)) return;
    const radians = (distanceM / this.radiusM) % (2 * Math.PI);
    for (const {node, sense, initialQuaternion} of this.wheels) {
      node.quaternion.copy(initialQuaternion);
      node.rotateX(sense * radians);
    }
  }
  reset() {
    for (const {node, initialQuaternion} of this.wheels) {
      node.quaternion.copy(initialQuaternion);
    }
  }
}
