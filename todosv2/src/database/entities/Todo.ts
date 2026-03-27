import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';
import { User } from './User';
import { Category } from './Category';

@Entity('todos')
export class Todo {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string;

  @Column({ type: 'varchar', length: 10, default: 'medium' })
  priority!: 'low' | 'medium' | 'high';

  @Column({ type: 'date', nullable: true })
  dueDate!: Date;

  @Column({ type: 'datetime', nullable: true })
  completedAt!: Date;

  @Column({ type: 'boolean', default: false })
  isCompleted!: boolean;

  @Column({ type: 'integer', default: 0 })
  postponedCount!: number;

  @Column({ type: 'integer', default: 0 })
  estimatedMinutes!: number;

  @Column({ type: 'json', nullable: true })
  tags!: string[];

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;

  @ManyToOne(() => User, (user) => user.todos)
  user!: User;

  @Column()
  userId!: number;

  @ManyToOne(() => Category, (category) => category.todos)
  category!: Category;

  @Column()
  categoryId!: number;
}