import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
export class UpdateStaffDto {
  @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @Matches(/^\+?[0-9\s()-]{6,25}$/) phone?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) roleIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) permissionCodes?: string[];
}
