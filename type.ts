export type GroupItemsType = {
  id: string;
  location: string;
  country: string;
  name?: string;
  isActive: boolean;
}

export type PrayerTimingsType = {
  Imsak: string;
  Fajr: string;
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

export type DailyReminderType = {
  id: number;
  groupId: string;
  location: string;
  schedules: Array<SchedulesType>;
}

export type SchedulesType = {
  name: 'fajr' | 'duhr' | 'asr' | 'maghrib' | 'isha' | string;
  time: number;
}

export type PrayerTimesData = {
  timmings : PrayerTimingsType,
  timezone : string;
  country: string;

}