import os
import smtplib
import ssl
from email.message import EmailMessage


def _send_message(message: EmailMessage) -> dict:
    delivery_provider = os.getenv("EMAIL_PROVIDER", "smtp").strip().lower()
    if delivery_provider in {"local", "console", "debug"}:
        print(f"[email] {message['To']}: {message.get_content()}")
        return {"provider": delivery_provider}

    if delivery_provider != "smtp":
        raise ValueError("EMAIL_PROVIDER must be smtp or local")

    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = os.getenv("SMTP_USERNAME")
    smtp_password = os.getenv("SMTP_PASSWORD")
    use_ssl = os.getenv("SMTP_USE_SSL", "false").lower() == "true"
    use_tls = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
    timeout = int(os.getenv("SMTP_TIMEOUT_SECONDS", "20"))

    if not smtp_host or not smtp_username or not smtp_password:
        raise ValueError("SMTP_HOST, SMTP_USERNAME and SMTP_PASSWORD must be configured")

    if use_ssl or smtp_port == 465:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=timeout, context=context) as server:
            server.login(smtp_username, smtp_password)
            server.send_message(message)
        return {"provider": "smtp"}

    with smtplib.SMTP(smtp_host, smtp_port, timeout=timeout) as server:
        if use_tls:
            context = ssl.create_default_context()
            server.starttls(context=context)
        server.login(smtp_username, smtp_password)
        server.send_message(message)
    return {"provider": "smtp"}


def send_registration_code(to_email: str, code: str) -> None:
    message = EmailMessage()
    message["Subject"] = "大汐平台邮箱验证码 / DAXI verification code"
    message["From"] = os.getenv("SMTP_FROM_EMAIL") or os.getenv("SMTP_USERNAME") or "no-reply@voxindex.local"
    message["To"] = to_email
    message.set_content(
        f"您好，您的大汐平台注册验证码是：{code}\n\n"
        "验证码 10 分钟内有效，请勿告诉他人。如非本人操作，请忽略此邮件。\n\n"
        f"Your DAXI registration code is {code}. It expires in 10 minutes."
    )
    _send_message(message)


def send_password_reset_code(to_email: str, code: str) -> None:
    message = EmailMessage()
    message["Subject"] = "大汐平台密码重置验证码 / DAXI password reset code"
    message["From"] = os.getenv("SMTP_FROM_EMAIL") or os.getenv("SMTP_USERNAME") or "no-reply@voxindex.local"
    message["To"] = to_email
    message.set_content(
        f"您好，您的大汐平台密码重置验证码是：{code}\n\n"
        "验证码 10 分钟内有效。如非本人操作，请忽略此邮件。\n\n"
        f"Your DAXI password reset code is {code}. It expires in 10 minutes."
    )
    _send_message(message)


def send_password_reset_email(to_email: str, reset_url: str) -> None:
    delivery_provider = os.getenv("EMAIL_PROVIDER", "smtp").strip().lower()

    if delivery_provider in {"local", "console", "debug"}:
        print(f"[password-reset] {to_email}: {reset_url}")
        return {"provider": delivery_provider, "reset_url": reset_url}

    smtp_username = os.getenv("SMTP_USERNAME")
    smtp_from = os.getenv("SMTP_FROM_EMAIL") or smtp_username or "no-reply@voxindex.local"

    message = EmailMessage()
    message["Subject"] = "Reset your VoxIndex password"
    message["From"] = smtp_from
    message["To"] = to_email

    text_body = (
        "You requested a password reset for VoxIndex.\n\n"
        f"Reset your password here: {reset_url}\n\n"
        "If you did not request this, you can ignore this email."
    )
    html_body = f"""
    <html>
      <body style=\"font-family: Arial, sans-serif; color: #111827;\">
        <h2>Reset your VoxIndex password</h2>
        <p>You requested a password reset for your VoxIndex account.</p>
        <p><a href=\"{reset_url}\">Reset your password</a></p>
        <p>If you did not request this, you can ignore this email.</p>
      </body>
    </html>
    """

    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    return _send_message(message)
