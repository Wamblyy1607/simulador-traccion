import {ChargingSystem} from './charging-system.js';
/** Spatial / motion guard; electrical and thermal integration remains in ChargingSystem. */
export class SpatialChargingSystem extends ChargingSystem{
  locationAllowed(){if(Math.abs(this.physics.speedMS)>.001){this.reason='Detén el vehículo antes de cargar (avance o marcha atrás).';return false;}
    if(!this.locationGuard||this.locationGuard())return true;
    this.reason='Estaciona en una plaza válida y detén el vehículo antes de cargar.';return false;}
  connect(){return this.locationAllowed()&&super.connect();}
  verify(){return this.locationAllowed()&&super.verify();}
  start(){return this.locationAllowed()&&super.start();}
  step(dt){
    if(!(dt>0&&dt<=.1))return super.step(dt);
    if(this.state==='CARGANDO'&&!this.locationAllowed()){this.pause();this.reason='Recarga suspendida: fuera de la parada autorizada.';return this.snapshot();}
    return super.step(dt);
  }
}
