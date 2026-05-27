import React from "react";

export default function Container({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-7xl min-w-0 px-4 sm:px-5 md:px-8 ${className}`}>
      {children}
    </div>
  );
}
