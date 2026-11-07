// Aislamiento visual no destructivo: los materiales originales del GLB
// se restauran íntegramente al abandonar el modo de inspección.
export class VisibilityManager {
  constructor(car){
    this.car=car;
    this.initial=new Map();
    this.overrideMaterials=[];
    car.traverse(o=>this.initial.set(o,o.visible));
    this.isolated=false;
  }
  restore(){
    this.xray?.beforeVisibilityChange();
    // Restaurar antes de eliminar clones temporales: ciertos materiales se
    // comparten entre varias mallas del archivo GLB original.
    for(const {mesh,original,temporary} of this.overrideMaterials){
      mesh.material=original;
      for(const material of temporary)material.dispose();
    }
    this.overrideMaterials=[];
    this.car.traverse(o=>o.visible=this.initial.get(o)??true);
    this.isolated=false;
    this.xray?.afterVisibilityChange();
  }
  isolate(item){
    if(!item)return false;
    this.restore();
    if(item.xrayPart&&this.xray?.enabled)return this.xray.isolatePart(item);
    const descendants=new Set();
    for(const anchor of item.anchors)anchor.traverse(node=>descendants.add(node));
    const meshes=[];
    this.car.traverse(o=>{
      if(!o.isMesh)return;
      o.visible=descendants.has(o) && (this.initial.get(o)??true);
      if(o.visible)meshes.push(o);
    });
    if(!meshes.length)return false;

    // El parabrisas del GLB usa material bolt_glass con alpha = 0.
    // Su malla existe, pero al aislarla queda invisible. Para inspección
    // usamos un clon temporal ligeramente teñido, sin editar el asset.
    for(const mesh of meshes){
      const original=mesh.material;
      const current=Array.isArray(original)?original:[original];
      if(!current.some(m=>m?.opacity!==undefined && m.opacity<.06))continue;
      const temporary=[];
      const adapted=current.map(material=>{
        if(!material || material.opacity>=.06)return material;
        const clone=material.clone();
        clone.transparent=true;
        clone.opacity=.72;
        clone.depthWrite=true;
        clone.side=2; // THREE.DoubleSide (sin importación extra).
        if(clone.color)clone.color.set('#9ceaf0');
        if(clone.emissive){clone.emissive.set('#0b5367');clone.emissiveIntensity=.18;}
        clone.needsUpdate=true;
        temporary.push(clone);
        return clone;
      });
      mesh.material=Array.isArray(original)?adapted:adapted[0];
      if(temporary.length)this.overrideMaterials.push({mesh,original,temporary});
    }
    this.isolated=true;
    this.xray?.onExteriorIsolated();
    return true;
  }
}
