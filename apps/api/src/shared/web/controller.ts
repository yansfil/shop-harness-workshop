import type { Router } from "express";

/** 각 모듈의 web 계층 controller가 구현한다. 조립 파일(composition.ts)이 만들어 createApp에 넘긴다. */
export interface Controller {
  register(router: Router): void;
}
