import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany } from 'typeorm';
import { User } from './User';
import { Todo } from './Todo';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 7, default: '#3B82F6' })
  color!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  icon!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;

  @ManyToOne(() => User, (user) => user.categories)
  user!: User;

  @Column()
  userId!: number;

  @OneToMany(() => Todo, (todo) => todo.category)
  todos!: Todo[];
}