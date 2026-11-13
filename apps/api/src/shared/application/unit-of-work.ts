/** 여러 저장소 호출을 한 트랜잭션으로 묶는다. 안쪽에서 다시 부르면 바깥 트랜잭션에 합류한다. */
export interface UnitOfWork {
  run<T>(fn: () => T): T;
}
