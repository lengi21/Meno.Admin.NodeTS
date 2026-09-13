import { ArrayUnique, IsArray, IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
export class CreateStaffDto {
  @IsString() @MaxLength(80) firstName!: string;
  @IsString() @MaxLength(80) lastName!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @Matches(/^\+?[0-9\s()-]{6,25}$/) phone?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) roleIds?: string[];
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) permissionCodes?: string[];
}
