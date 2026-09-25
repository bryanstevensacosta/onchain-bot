import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';
import { snakeCase } from 'typeorm/util/StringUtils';

/**
 * SnakeCaseNamingStrategy (Tramo 2, todo 1).
 *
 * Mirrors the backend DB convention: camelCase properties map to
 * snake_case columns/tables (createdAt -> created_at).
 */
export class SnakeCaseNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  public tableName(targetName: string, userSpecifiedName: string | undefined): string {
    return userSpecifiedName ?? snakeCase(targetName);
  }

  public columnName(
    propertyName: string,
    customName: string | undefined,
    embeddedPrefixes: string[],
  ): string {
    const base =
      customName ?? [...embeddedPrefixes, propertyName].join('_');
    return snakeCase(base);
  }
}
