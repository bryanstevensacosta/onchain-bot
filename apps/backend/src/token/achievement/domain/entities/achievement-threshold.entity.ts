import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Represents a configured multiple (e.g., 2×, 3×) that triggers an achievement.
 * Stored in `achievement_thresholds` table.
 */
@Entity({ name: 'achievement_thresholds' })
export class AchievementThresholdEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  /**
   * Multiple as a decimal (e.g., 2 for "2×", 3.5 for "3.5×").
   * Must be > 1.
   */
  @Column({ type: 'float', nullable: false })
  multiple!: number;
}
