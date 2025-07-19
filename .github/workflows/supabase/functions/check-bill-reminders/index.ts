import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get today's date
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    console.log(`Checking reminders for date: ${todayStr}`)

    // Get all incomplete reminders
    const { data: reminders, error: fetchError } = await supabase
      .from('bill_reminders')
      .select('*')
      .eq('isCompleted', false)

    if (fetchError) {
      throw new Error(`Failed to fetch reminders: ${fetchError.message}`)
    }

    console.log(`Found ${reminders?.length || 0} incomplete reminders`)

    let emailsSent = 0
    const emailResults = []

    for (const reminder of reminders || []) {
      const reminderDate = new Date(reminder.nextReminderDate)
      const daysDiff = Math.floor((today.getTime() - reminderDate.getTime()) / (1000 * 60 * 60 * 24))
      
      // Send email if:
      // 1. Today is the reminder date (daysDiff === 0)
      // 2. Or it's overdue and every 2 days after (daysDiff > 0 and daysDiff % 2 === 0)
      const shouldSendEmail = daysDiff === 0 || (daysDiff > 0 && daysDiff % 2 === 0)
      
      console.log(`Reminder: ${reminder.description}, Days diff: ${daysDiff}, Should send: ${shouldSendEmail}`)

      if (shouldSendEmail) {
        try {
          // Send email using the existing send-bill-reminder function
          const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-bill-reminder`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: 'ywt76@yahoo.com',
              subject: daysDiff === 0 
                ? `💳 Bill Reminder: ${reminder.description}` 
                : `⚠️ Overdue Bill Reminder: ${reminder.description} (${daysDiff} days overdue)`,
              reminderData: {
                description: reminder.description,
                category: reminder.category,
                nextReminderDate: reminder.nextReminderDate,
                amount: reminder.amount,
                frequency: reminder.frequency,
                isOverdue: daysDiff > 0,
                daysOverdue: daysDiff
              },
            }),
          })

          if (emailResponse.ok) {
            emailsSent++
            emailResults.push({
              reminder: reminder.description,
              status: 'sent',
              daysOverdue: daysDiff
            })
            console.log(`✅ Email sent for: ${reminder.description}`)
          } else {
            const errorText = await emailResponse.text()
            emailResults.push({
              reminder: reminder.description,
              status: 'failed',
              error: errorText
            })
            console.error(`❌ Failed to send email for: ${reminder.description}`, errorText)
          }
        } catch (emailError) {
          emailResults.push({
            reminder: reminder.description,
            status: 'error',
            error: emailError.message
          })
          console.error(`❌ Error sending email for: ${reminder.description}`, emailError)
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Checked ${reminders?.length || 0} reminders, sent ${emailsSent} emails`,
        date: todayStr,
        emailResults
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error in check-bill-reminders:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
