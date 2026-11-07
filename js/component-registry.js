// Identificadores verificados en el GLB facilitado para este proyecto.
// Son geometrías visuales, NO parámetros ni componentes electromecánicos OEM.
export const COMPONENT_DEFINITIONS = [
  {id:'body',title:'Carrocería',category:'Estructura',icon:'▣',nodes:['bolt_body'],description:'Conjunto de paneles exteriores visibles. La representación incluye materiales de carrocería y piezas de acabado; no representa la estructura resistente completa.'},
  {id:'hood',title:'Capó delantero',category:'Carrocería',icon:'▱',nodes:['bonnet_dummy'],description:'Panel de acceso superior al compartimento delantero. El archivo contiene geometría diferenciada, pero no una animación de apertura.'},
  {id:'front-door-left',title:'Puerta delantera izquierda',category:'Carrocería',icon:'◧',nodes:['door_lf_dummy'],description:'Puerta y piezas visuales asociadas de acceso al habitáculo en el lado izquierdo.'},
  {id:'front-door-right',title:'Puerta delantera derecha',category:'Carrocería',icon:'◨',nodes:['door_rf_dummy'],description:'Puerta y piezas visuales asociadas del lado derecho del habitáculo.'},
  {id:'rear-door-left',title:'Puerta trasera izquierda',category:'Carrocería',icon:'◧',nodes:['door_lr_dummy'],description:'Acceso lateral a la segunda fila, modelado como grupo de componentes visuales.'},
  {id:'rear-door-right',title:'Puerta trasera derecha',category:'Carrocería',icon:'◨',nodes:['door_rr_dummy'],description:'Acceso lateral a la segunda fila en el lado derecho.'},
  {id:'tailgate',title:'Portón trasero',category:'Carrocería',icon:'▱',nodes:['boot_dummy'],description:'Portón de acceso al área de carga; no se incluye una animación predefinida.'},
  {id:'front-bumper',title:'Defensa delantera',category:'Carrocería',icon:'▰',nodes:['bump_front_dummy'],description:'Conjunto exterior de defensa delantera y elementos de acabado.'},
  {id:'rear-bumper',title:'Defensa trasera',category:'Carrocería',icon:'▰',nodes:['bump_rear_dummy'],description:'Conjunto exterior de defensa trasera y elementos de acabado.'},
  {id:'front-left-wheel',title:'Rueda delantera izquierda',category:'Ruedas',icon:'◉',nodes:['bolt_wheel','bolt_wheel.001'],description:'Conjunto visual de neumático y rueda en el eje delantero izquierdo. El radio mostrado procede de la geometría; no es un radio dinámico calibrado.'},
  {id:'front-right-wheel',title:'Rueda delantera derecha',category:'Ruedas',icon:'◉',nodes:['bolt_wheel.006','bolt_wheel.007'],description:'Conjunto visual de neumático y rueda en el eje delantero derecho.'},
  {id:'rear-left-wheel',title:'Rueda trasera izquierda',category:'Ruedas',icon:'◉',nodes:['bolt_wheel.002','bolt_wheel.003'],description:'Conjunto visual de neumático y rueda en el eje trasero izquierdo.'},
  {id:'rear-right-wheel',title:'Rueda trasera derecha',category:'Ruedas',icon:'◉',nodes:['bolt_wheel.004','bolt_wheel.005'],description:'Conjunto visual de neumático y rueda en el eje trasero derecho.'},
  {id:'headlight-left',title:'Faro delantero izquierdo',category:'Iluminación',icon:'✧',nodes:['bolt_headlight_L','bolt_headlightglass_L'],description:'Geometría del conjunto óptico izquierdo. No se ha aplicado todavía una simulación eléctrica ni fotométrica.'},
  {id:'headlight-right',title:'Faro delantero derecho',category:'Iluminación',icon:'✧',nodes:['bolt_headlight_R','bolt_headlightglass_R'],description:'Geometría del conjunto óptico derecho, sin simulación de haz luminoso.'},
  {id:'taillight-left',title:'Luz trasera izquierda',category:'Iluminación',icon:'✧',nodes:['bolt_taillight_L','bolt_taillightsglass_L'],description:'Conjunto visual de luz trasera izquierda.'},
  {id:'taillight-right',title:'Luz trasera derecha',category:'Iluminación',icon:'✧',nodes:['bolt_taillight_R','bolt_taillightsglass_R'],description:'Conjunto visual de luz trasera derecha.'},
  {id:'windscreen',title:'Parabrisas',category:'Cristales',icon:'◇',nodes:['windscreen_dummy'],description:'Superficie acristalada delantera del vehículo.'},
  {id:'interior',title:'Habitáculo',category:'Interior',icon:'▤',nodes:['bolt_interior_1','bolt_interior_2'],description:'Geometría de acabados e instrumentos del habitáculo, modelada sin funcionalidad electrónica.'},
  {id:'steering',title:'Volante',category:'Interior',icon:'◎',nodes:['bolt_steering_wheel'],description:'Elemento de mando de dirección, sin conexión cinemática al ángulo real de ruedas en HITO 1.'}
];

export class ComponentRegistry {
  constructor(car){
    this.car=car;
    this.items=[];
    this.nodesToItem=new Map();
    const nodesByName=new Map();
    car.traverse(o=>{if(o.name){const a=nodesByName.get(o.name)||[];a.push(o);nodesByName.set(o.name,a);}});
    for(const def of COMPONENT_DEFINITIONS){
      const anchors=def.nodes.flatMap(n=>nodesByName.get(n)||[]);
      if(!anchors.length)continue;
      const item={...def,anchors};
      this.items.push(item);
      for(const node of anchors)this.nodesToItem.set(node,item);
    }
  }
  hitToItem(object){
    for(let node=object;node&&node!==this.car.parent;node=node.parent){
      const matched=this.nodesToItem.get(node);
      if(matched)return matched;
    }
    return null;
  }
  find(id){return this.items.find(item=>item.id===id)||null;}
}
