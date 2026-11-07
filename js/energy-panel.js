export class EnergyPanel {
  constructor(){this.$=id=>document.getElementById(id);}
  setActive(enabled){this.$('energy-panel').hidden=!enabled;this.$('energy-overview').hidden=!enabled;}
  update(o){
    const val=(id,value,places=1)=>this.$(id).textContent=Number.isFinite(value)?value.toFixed(places):'--';
    val('e-battery',o.batteryNetPowerW/1000);
    val('e-motor',o.motorMechanicalPowerW/1000);
    val('e-wheels',(o.tractionWheelPowerW-o.regenWheelPowerW)/1000);
    val('e-loss',o.totalLossW/1000);
    val('e-rec',o.dcRegeneratedPowerW/1000);
    val('e-used-kwh',o.energyTractionKWh,3);
    val('e-rec-kwh',o.energyRecoveredKWh,3);
    val('e-aux-kwh',o.energyAuxiliaryKWh,3);
    val('e-brake-r',o.forceRegenN,0);
    val('e-brake-f',o.forceFrictionBrakeN,0);
    val('e-balance',Math.max(Math.abs(o.tractionBalanceErrorW),Math.abs(o.regenBalanceErrorW)),5);
    const regen=o.dcRegeneratedPowerW>1,drive=o.dcTractionPowerW>1;
    const state=regen?'REGENERACIÓN':drive?'TRACCIÓN':'SIN FLUJO DE TRACCIÓN';
    this.$('energy-state').textContent=state;
    this.$('energy-direction').textContent=regen?'RUEDAS → MOTOR → INVERSOR → BATERÍA':drive?'BATERÍA → INVERSOR → MOTOR → RUEDAS':'SIN TRACCIÓN / CONSUMO AUXILIAR';
    this.$('energy-flow-chain').dataset.flow=regen?'regen':drive?'drive':'none';
    this.$('energy-overview').dataset.flow=regen?'regen':drive?'drive':'none';
  }
}
