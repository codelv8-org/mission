// Calendar boundaries in Asia/Bangkok (UTC+07:00, no DST).
export const CALENDAR_ZONE="Asia/Bangkok";
const DAY=86400000,OFFSET=7*3600000;
const iso=ms=>new Date(ms).toISOString().slice(0,10);
export const calendarDay=ms=>iso(ms+OFFSET);
export const normalizePeriod=value=>["7","30","month","year"].includes(String(value))?String(value):"7";
export function periodRange(value,asOf=Date.now()){
  const period=normalizePeriod(value),endDate=calendarDay(asOf),endDay=Date.parse(endDate+"T00:00:00Z");
  const d=new Date(endDay),year=d.getUTCFullYear(),month=d.getUTCMonth();
  const unit=period==="year"?"month":"day";
  const startDay=period==="month"?Date.UTC(year,month-1,1):period==="year"?Date.UTC(year-1,0,1):endDay-(Number(period)-1)*DAY;
  const dates=[];
  if(unit==="month"){
    const first=new Date(startDay);
    for(let y=first.getUTCFullYear(),m=first.getUTCMonth();Date.UTC(y,m,1)<=endDay;m++){
      if(m===12){y++;m=0;}
      dates.push(iso(Date.UTC(y,m,1)));
    }
  }else for(let ms=startDay;ms<=endDay;ms+=DAY)dates.push(iso(ms));
  return {period,unit,start:startDay-OFFSET,asOf,startDate:iso(startDay),endDate,dates};
}
export function bucketKey(ms,unit="day"){
  const day=calendarDay(ms);
  return unit==="month"?day.slice(0,7)+"-01":day;
}
export function weekdayIndex(date){return new Date(date+"T00:00:00Z").getUTCDay();}
export const WEEKDAYS_TH=Object.freeze(["อา.","จ.","อ.","พ.","พฤ.","ศ.","ส."]);
export function isWeekend(date){return [0,6].includes(weekdayIndex(date));}
export function monthGroups(dates){
  const groups=[];
  for(const date of dates){const key=date.slice(0,7);const last=groups.at(-1);if(last?.key===key)last.span++;else groups.push({key,date:key+"-01",span:1});}
  return groups;
}
// Previous calendar window of the same elapsed duration, including
// the same number of ICT calendar dates and equivalent time-of-day on its last day.
export function previousPeriodRange(range){
  const elapsed=range.asOf-range.start+1,days=Math.round((Date.parse(range.endDate+"T00:00:00Z")-Date.parse(range.startDate+"T00:00:00Z"))/DAY)+1;
  const start=range.start-days*DAY,asOf=start+elapsed-1,startDate=calendarDay(start),endDate=calendarDay(asOf),dates=[];
  if(range.unit==="month"){
    const d=new Date(startDate+"T00:00:00Z"),end=Date.parse(endDate+"T00:00:00Z");
    for(let m=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);m<=end;){dates.push(iso(m));const x=new Date(m);m=Date.UTC(x.getUTCFullYear(),x.getUTCMonth()+1,1);}
  }else for(let i=0;i<days;i++)dates.push(calendarDay(start+i*DAY));
  return {...range,start,asOf,startDate,endDate,dates};
}
export function historyRequest(value,now=Date.now(),{compare=false}={}){
  const period=normalizePeriod(value),range=periodRange(period,now),base=periodRange("30",now);
  const pages=period==="year"?5:period==="month"?3:1;
  return {since:new Date(Math.min(range.start,base.start,compare?previousPeriodRange(range).start:Infinity)).toISOString(),pages:compare?Math.max(pages,period==="month"||period==="year"?5:3):pages};
}
