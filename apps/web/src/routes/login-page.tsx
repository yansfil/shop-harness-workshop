import { DEMO_ACCOUNTS } from "@grabmarket/contracts";
import { type ActionFunctionArgs, Form, redirect, useActionData, useNavigation, useSearchParams } from "react-router";
import { callApi, isApiError } from "../api/client.ts";
import { Button } from "../components/button.tsx";
import { safeNext } from "../lib/login-path.ts";

interface LoginFailure {
  error: string;
  email: string;
}

export async function loginAction({ request }: ActionFunctionArgs): Promise<LoginFailure | Response> {
  const form = await request.formData();
  const email = text(form.get("email")).trim();
  const password = text(form.get("password"));
  const next = new URL(request.url).searchParams.get("next");
  try {
    const { user } = await callApi("login", { body: { email, password } });
    return redirect(next === null && user.role === "admin" ? "/admin/orders" : safeNext(next));
  } catch (error) {
    if (isApiError(error)) return { error: error.message, email };
    throw error;
  }
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function introFor(next: string): string {
  if (next.startsWith("/checkout")) return "주문하려면 로그인해 주세요. 로그인하면 주문서로 돌아가요";
  if (next.startsWith("/orders")) return "내 주문을 보려면 로그인해 주세요";
  if (next.startsWith("/admin")) return "관리자 화면은 관리자 계정으로 로그인해야 볼 수 있어요";
  return "로그인해 주세요";
}

const fieldClass = "mt-2 h-12 w-full rounded-md border border-ink-3 bg-ground px-4 text-base text-ink placeholder:text-ink-3";

export function LoginPage() {
  const failure = useActionData<LoginFailure | undefined>();
  const navigation = useNavigation();
  const [params] = useSearchParams();
  const pending = navigation.state === "submitting";

  return (
    <div className="px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto flex max-w-225 flex-col gap-4 md:flex-row md:items-start">
        <section aria-labelledby="login-title" className="rounded-md border border-line bg-ground p-6 md:flex-1 md:p-8">
          <h1 id="login-title" className="text-xl leading-8 font-extrabold text-ink">
            로그인
          </h1>
          <p className="mt-1 text-sm text-ink-2">{introFor(params.get("next") ?? "")}</p>
          <Form method="post" className="mt-6 flex flex-col gap-4">
            <div>
              <label htmlFor="login-email" className="text-xs-plus font-bold text-ink">
                이메일
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="username"
                required
                defaultValue={failure?.email}
                placeholder="이메일을 입력해 주세요"
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="login-password" className="text-xs-plus font-bold text-ink">
                비밀번호
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="비밀번호를 입력해 주세요"
                className={fieldClass}
              />
            </div>
            {failure !== undefined && (
              <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-xs-plus font-semibold text-danger">
                {failure.error}
              </p>
            )}
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "로그인하는 중" : "로그인"}
            </Button>
          </Form>
        </section>
        <section aria-labelledby="demo-title" className="rounded-md border border-line bg-ground p-6 md:flex-1 md:p-8">
          <h2 id="demo-title" className="text-lg leading-7 font-extrabold text-ink">
            교육용 계정
          </h2>
          <p className="mt-1 text-sm text-ink-2">실습에 쓰는 계정이에요</p>
          <table className="mt-5 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs-plus text-ink-3">
                <th scope="col" className="pb-2 font-normal">
                  구분
                </th>
                <th scope="col" className="pb-2 font-normal">
                  이메일
                </th>
                <th scope="col" className="pb-2 font-normal">
                  비밀번호
                </th>
              </tr>
            </thead>
            <tbody>
              {DEMO_ACCOUNTS.map((account) => (
                <tr key={account.email} className="border-b border-line last:border-b-0">
                  <th scope="row" className="h-12 pr-3 font-bold text-ink">
                    {account.label}
                  </th>
                  <td className="pr-3 break-all text-ink">{account.email}</td>
                  <td className="text-ink">{account.password}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <p className="mt-6 text-center text-xs-plus text-ink-2">그랩마켓은 가상의 교육용 쇼핑몰이에요. 실제 결제와 배송은 이뤄지지 않아요.</p>
    </div>
  );
}
