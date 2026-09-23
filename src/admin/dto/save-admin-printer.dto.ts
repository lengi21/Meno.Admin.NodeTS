import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SaveAdminPrinterDto {
  @IsString() name!: string;
  @IsIn(['USB', 'BLUETOOTH', 'NETWORK']) connection!: 'USB' | 'BLUETOOTH' | 'NETWORK';
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsInt() @Min(58) @Max(80) paperWidthMm?: number;
  @IsOptional() @IsArray() routes?: string[];
  @IsOptional() isActive?: boolean;
}
