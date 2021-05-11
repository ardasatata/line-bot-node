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

// Used for looping
export const PrayerTimings = [
  'Imsak',
  'Fajr',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha'
]

// Debug purpose
export const example_response = {
  country: 'Taiwan',
  timezone: 'Asia/Taipei',
  timmings: {
    Imsak: '03:53',
    Sunrise: '05:22',
    Fajr: '04:03',
    Dhuhr: '11:52',
    Asr: '17:26',
    Maghrib: '17:28',
    Isha: '17:30',
    Midnight: '23:12'
  }
}