/** H4 Battery Explorer — presentador DOM, sin física en la interfaz. */
export class BatteryExplorer{
 constructor(){this.$=id=>document.getElementById(id);}
 setActive(active){this.$('battery-panel').hidden=!active;this.$('battery-overview').hidden=!active;}
 update(o){
  if(!Number.isFinite(o.batterySoc))return;
  const fixed=(id,value,decimals=1)=>{const el=this.$(id);if(el)el.textContent=Number.isFinite(value)?value.toFixed(decimals):'--';};
  fixed('b-soc',o.batterySoc*100);fixed('b-soc-overlay',o.batterySoc*100,1);
  fixed('b-voltage',o.batteryVoltageV);fixed('b-current',o.batteryCurrentA);
  fixed('b-ocv',o.batteryOcvV);fixed('b-polarization',o.batteryPolarizationV,3);
  fixed('b-power',o.batteryNetPowerW/1000,2);fixed('b-heat',o.batteryHeatLossW/1000,2);
  fixed('b-discharge-limit',o.batteryAllowedDischargeW/1000,1);
  fixed('b-charge-limit',o.batteryAllowedChargeW/1000,1);
  fixed('b-energy',o.batteryEnergyNetKWh,3);
  fixed('b-balance',o.batteryBalanceResidualW,6);
  fixed('b-temperature',o.batteryTemperatureC,0);
  this.$('b-soc-fill').style.width=`${Math.max(0,Math.min(100,o.batterySoc*100))}%`;
  const status=o.batteryBmsStatus||'NORMAL';
  this.$('b-bms-status').textContent=status;
  this.$('b-bms-status').dataset.state=status;
  this.$('b-warning').textContent=o.batteryBmsWarning||'OPERACIÓN NORMAL';
  this.$('b-soc-overlay').parentElement.dataset.state=status;
 }
}
