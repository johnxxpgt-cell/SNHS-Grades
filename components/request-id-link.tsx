"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";
import { urlWithRequestId } from "@/lib/request-id";

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

/** Link that assigns a fresh, non-secret UUID to each login/registration navigation. */
export function RequestIdLink({ href, onClick, target, ...props }: Props) {
  const router = useRouter();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || target === "_blank") return;
    event.preventDefault();
    router.push(urlWithRequestId(href));
  }

  return <Link href={href} target={target} onClick={handleClick} {...props} />;
}
