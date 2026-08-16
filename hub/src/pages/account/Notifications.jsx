import PageHead from '../../layouts/PageHead.jsx'
import { NotMeasured } from '../../components/index.js'

export default function Notifications() {
  return (
    <>
      <PageHead
        title="اعلان‌ها و کانال هشدار"
        subtitle="کانال‌ها و ترجیحات اطلاع‌رسانی"
      />
      <NotMeasured
        title="اعلان‌ها"
        reason="تنظیمات اعلان هنوز ساخته نشده. گزارش امنیتی روزانه فقط به تلگرامی می‌رود که در سرور پیکربندی شده."
      />
    </>
  )
}
