export interface PosSettings {
  restaurantId: string;
  serviceFeePercent: number;
  defaultLanguage: 'ka' | 'en' | 'ru';
  businessDayStart: string;
  businessDayEnd: string;
}
export interface StaffSummary { id: string; name: string; contact: string; active: boolean; }
export interface RoleSummary { id: string; name: string; permissions: string[]; }
