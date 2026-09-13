import { IsIn, IsNumber, IsOptional, Matches, Max, Min } from 'class-validator';
export class UpdatePosSettingsDto {
  @IsOptional() @Matches(/^([01]\\d|2[0-3]):[0-5]\\d$/) businessDayStart?: string;
  @IsOptional() @Matches(/^([01]\\d|2[0-3]):[0-5]\\d$/) businessDayEnd?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) serviceFeePercent?: number;
  @IsOptional() @IsIn(['ka', 'en', 'ru']) defaultLanguage?: 'ka' | 'en' | 'ru';
}
