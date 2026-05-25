-- Enforce one login identity per email across all tenants.
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
