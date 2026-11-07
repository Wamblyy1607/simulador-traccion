/** Read-only bindings to the existing lumped ThermalSystem; never infer a temperature. */
export const THERMAL_ITEMS=Object.freeze({
 battery:{label:'Batería HV',key:'batteryC',note:'Temperatura agregada del pack utilizada por el BMS; no resolución por celda.'},
 motor:{label:'Motor eléctrico',key:'motorC',note:'Nodo térmico del motor, alimentado por las pérdidas del tren motriz.'},
 inverter:{label:'Inversor / OBC',key:'electronicsC',note:'Nodo agregado de electrónica de potencia. No hay temperaturas independientes de inversor y cargador.'},
 coolant:{label:'Refrigerante HV',key:'batteryCoolantC',note:'Temperatura del fluido del circuito HV. No representa la temperatura de la carcasa de bomba o placas.'},
 powerCoolant:{label:'Refrigerante de potencia',key:'powerCoolantC',note:'Temperatura del fluido del circuito de motor/electrónica; no temperatura del metal del radiador.'},
 cabin:{label:'Habitáculo',key:'cabinC',note:'Temperatura agregada del habitáculo; el calentador dibujado no dispone de temperatura propia.'},
 pdu:{label:'Distribución HV / PDU',key:null,note:'Sin nodo térmico ni temperatura propia calculada para la PDU.'},
 pump:{label:'Bomba de refrigerante HV',key:null,associated:'batteryCoolantC',note:'No hay temperatura calculada de la carcasa de bomba. El valor asociado corresponde al refrigerante HV.'},
 radiator:{label:'Radiador / ventilador',key:null,associated:'powerCoolantC',note:'Radiador y ventilador no tienen temperatura propia calculada. El valor asociado corresponde al refrigerante de potencia.'},
 plates:{label:'Placas de batería',key:null,associated:'batteryCoolantC',note:'No existe temperatura calculada de la placa metálica. Se conoce la temperatura del refrigerante HV.'}
});
export const THERMAL_SCALE=Object.freeze([[-10,0x3d7fff],[25,0x31d8c5],[60,0xffcf50],[90,0xff8045],[120,0xf04b61]].map(Object.freeze));
export function temperatureColor(value){
 if(!Number.isFinite(value))return 0x77818e;
 const t=Math.max(-10,Math.min(120,value));
 for(let i=1;i<THERMAL_SCALE.length;i++){const [a,ca]=THERMAL_SCALE[i-1],[b,cb]=THERMAL_SCALE[i];if(t>b)continue;const u=(t-a)/(b-a);let rgb=0;for(const shift of [16,8,0])rgb|=Math.round(((ca>>shift)&255)*(1-u)+((cb>>shift)&255)*u)<<shift;return rgb;}
 return THERMAL_SCALE.at(-1)[1];
}
export function thermalReading(id,snapshot={}){
 const item=THERMAL_ITEMS[id];if(!item)return null;
 const value=item.key?snapshot?.[item.key]:undefined,associated=item.associated?snapshot?.[item.associated]:undefined;
 return {...item,value:Number.isFinite(value)?value:null,associatedValue:Number.isFinite(associated)?associated:null,color:temperatureColor(value)};
}
