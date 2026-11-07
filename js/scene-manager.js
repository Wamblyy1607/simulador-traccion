import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VisualEnvironment} from './visual-environment.js';

export class SceneManager {
  constructor(canvas,container){
    this.canvas=canvas;
    this.container=container;
    this.scene=new THREE.Scene();
    this.scene.fog=new THREE.FogExp2('#0d1b30',.015);
    this.clock=new THREE.Clock();
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.45;
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.camera=new THREE.PerspectiveCamera(38,1,.04,200);
    this.camera.position.set(6,3.4,7.8);
    this.camera.lookAt(0,.78,0);
    this.car=null;
    this.bounds=new THREE.Box3();
    this.createEnvironment();
    this.visualEnvironment=new VisualEnvironment(this);
    this.resize();
    this.resizeObserver=new ResizeObserver(()=>this.resize());
    this.resizeObserver.observe(container);
    this.onWindowResize=()=>this.resize();
    window.addEventListener('resize',this.onWindowResize);
  }
  createEnvironment(){
    const ambient=new THREE.HemisphereLight(0xe6f5ff,0x24303b,3.3);
    this.scene.add(ambient);
    const key=new THREE.DirectionalLight(0xffffff,4.5);
    key.position.set(5,9,8);
    key.castShadow=true;
    key.shadow.mapSize.set(2048,2048);
    key.shadow.camera.left=-9;key.shadow.camera.right=9;key.shadow.camera.top=9;key.shadow.camera.bottom=-9;
    key.shadow.bias=-.0002;key.shadow.normalBias=.02;
    this.scene.add(key);
    const rim=new THREE.DirectionalLight(0x65b9ed,2.2);rim.position.set(-5,5,-7);this.scene.add(rim);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.22}));
    ground.rotation.x=-Math.PI/2;ground.position.y=-.02;ground.receiveShadow=true;ground.name='H1_EXPLORER_GROUND';this.scene.add(ground);
    const grid=new THREE.GridHelper(24,24,0x306479,0x18384e);
    grid.position.y=-.015;grid.name='H1_EXPLORER_GRID';
    const mats=Array.isArray(grid.material)?grid.material:[grid.material];
    mats.forEach(m=>{m.transparent=true;m.opacity=.23;});
    this.scene.add(grid);
    this.addPlatform();
  }
  addPlatform(){
    const ring=new THREE.Mesh(new THREE.RingGeometry(3.65,3.67,96),new THREE.MeshBasicMaterial({color:0x3bb4b5,transparent:true,opacity:.28,side:THREE.DoubleSide}));
    ring.rotation.x=-Math.PI/2;ring.position.y=.001;ring.name='H1_EXPLORER_RING';this.scene.add(ring);
  }
  resize(){
    const w=Math.max(1,this.container.clientWidth),h=Math.max(1,this.container.clientHeight);
    this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);
  }
  async loadCar(url,onProgress){
    const loader=new GLTFLoader();
    const gltf=await new Promise((resolve,reject)=>loader.load(url,resolve,event=>{
      if(event.lengthComputable && onProgress)onProgress(event.loaded/event.total);
    },reject));
    const car=gltf.scene;
    const before=new THREE.Box3().setFromObject(car);
    if(before.isEmpty())throw new Error('El GLB no contiene geometría visible.');
    const center=before.getCenter(new THREE.Vector3());
    car.position.x-=center.x;
    car.position.z-=center.z;
    car.position.y-=before.min.y;
    car.traverse(o=>{
      if(o.isMesh){o.castShadow=true;o.receiveShadow=true;
        // Los materiales originales son compartidos entre algunas mallas.
        // No se alteran ni reemplazan por materiales nuevos.
      }
    });
    this.scene.add(car);
    this.car=car;
    this.bounds.setFromObject(car);
    return {car,bounds:this.bounds};
  }
  useStage(container){
    this.container=container;
    container.appendChild(this.canvas);
    this.resizeObserver.disconnect();
    this.resizeObserver.observe(container);
    this.resize();
  }
  render(){this.visualEnvironment.sync();this.renderer.render(this.scene,this.camera);}
  dispose(){this.visualEnvironment.dispose();window.removeEventListener('resize',this.onWindowResize);this.resizeObserver?.disconnect();this.renderer.dispose();}
}
