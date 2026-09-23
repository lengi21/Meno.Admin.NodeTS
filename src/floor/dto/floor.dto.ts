import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SaveHallDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional() @IsString() menuId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SaveTableDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ReorderDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
}
