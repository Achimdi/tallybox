-- Receipt watermark: the faint mark behind every receipt. The Tallybox mark by
-- default; an owner can use their own text and/or their logo instead, or none.
-- The same rules as web/src/domain/receiptWatermark.ts.

alter table public.businesses
  add column receipt_watermark text not null default 'tallybox'
    check (receipt_watermark in ('tallybox', 'custom', 'none')),
  -- The owner's own words, kept while another kind is chosen.
  add column receipt_watermark_text text
    check (char_length(receipt_watermark_text) between 1 and 40),
  add column receipt_watermark_logo boolean not null default false,
  add constraint businesses_watermark_not_empty
    check (
      receipt_watermark <> 'custom'
      or receipt_watermark_text is not null
      or receipt_watermark_logo
    );

-- Same settings as before, plus the watermark. Left out (an app opened before
-- this change), the watermark is kept as it is.
drop function public.update_business_settings(text, text, text, text, text, text, integer);

create function public.update_business_settings(
  p_name text,
  p_currency_code text,
  p_timezone text,
  p_address text,
  p_phone text,
  p_receipt_footer text,
  p_default_low_stock_level integer,
  p_watermark text default null,
  p_watermark_text text default null,
  p_watermark_logo boolean default null
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_business_id uuid := private.require_owner((select auth.uid()));
  v_name text := private.clean_text(p_name);
  v_currency text := upper(trim(coalesce(p_currency_code, '')));
  v_timezone text := trim(coalesce(p_timezone, ''));
  v_address text := private.clean_text(p_address);
  v_phone text := private.clean_text(p_phone);
  v_footer text := private.clean_text(p_receipt_footer);
  v_watermark_text text := private.clean_text(p_watermark_text);
  v_watermark_logo boolean := coalesce(p_watermark_logo, false);
begin
  if v_name is null or char_length(v_name) not between 2 and 80
    or v_currency !~ '^[A-Z]{3}$'
    or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_timezone)
    or char_length(coalesce(v_address, '')) > 200
    or char_length(coalesce(v_phone, '')) > 30
    or char_length(coalesce(v_footer, '')) > 200
    or p_default_low_stock_level is null
    or p_default_low_stock_level not between 0 and 1000000 then
    perform private.fail('validation');
  end if;

  if p_watermark is not null and (
    p_watermark not in ('tallybox', 'custom', 'none')
    or char_length(coalesce(v_watermark_text, '')) > 40
    or (p_watermark = 'custom' and v_watermark_text is null and not v_watermark_logo)
  ) then
    perform private.fail('validation');
  end if;

  update public.businesses b
  set
    name = v_name,
    currency_code = v_currency,
    timezone = v_timezone,
    address = v_address,
    phone = v_phone,
    receipt_footer = v_footer,
    default_low_stock_level = p_default_low_stock_level,
    receipt_watermark = coalesce(p_watermark, b.receipt_watermark),
    receipt_watermark_text = case
      when p_watermark is null then b.receipt_watermark_text
      else v_watermark_text
    end,
    receipt_watermark_logo = case
      when p_watermark is null then b.receipt_watermark_logo
      else v_watermark_logo
    end
  where b.id = v_business_id;
end;
$$;

grant execute on function public.update_business_settings(
  text, text, text, text, text, text, integer, text, text, boolean
) to authenticated;
