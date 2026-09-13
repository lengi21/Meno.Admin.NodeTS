import { ArrayUnique, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
export class SaveRoleDto {
  @IsString() @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(240) description?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) permissionCodes?: string[];
}
