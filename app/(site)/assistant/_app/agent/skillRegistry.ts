/** 技能注册表：store 写入，request 读取，避免循环依赖。 */
import type { Skill } from './skills';

let current: Skill[] = [];

export function setSkillRegistry(skills: Skill[]): void {
  current = skills;
}

export function getSkillRegistry(): Skill[] {
  return current;
}
