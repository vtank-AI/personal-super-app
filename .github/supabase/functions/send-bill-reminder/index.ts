import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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
    const { to, subject, reminderData } = await req.json()

    // Get Resend API key from environment
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set')
    }

    // Create email content
    const isOverdue = reminderData.isOverdue || false
    const daysOverdue = reminderData.daysOverdue || 0
    
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: ${isOverdue ? '#dc2626' : '#2563eb'}; border-bottom: 2px solid ${isOverdue ? '#dc2626' : '#2563eb'}; padding-bottom: 10px;">
          ${isOverdue ? '⚠️ Overdue Bill Reminder' : '💳 Bill Reminder'}
        </h2>
        
        ${isOverdue ? `
        <div style="background-color: #fef2f2; border: 2px solid #fecaca; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #dc2626; font-weight: bold; font-size: 16px;">
            🚨 This bill is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue!
          </p>
        </div>
        ` : ''}
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>📋 Description:</strong> ${reminderData.description}</p>
          <p><strong>🏷️ Category:</strong> ${reminderData.category.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
          <p><strong>📅 Due Date:</strong> ${new Date(reminderData.nextReminderDate).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}</p>
          ${reminderData.amount ? `<p><strong>💰 Amount:</strong> $${reminderData.amount}</p>` : ''}
          <p><strong>🔄 Frequency:</strong> ${reminderData.frequency.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
        </div>
        
        <div style="background-color: ${isOverdue ? '#fef2f2' : '#fef3c7'}; border-left: 4px solid ${isOverdue ? '#dc2626' : '#f59e0b'}; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #92400e;">
            ${isOverdue ? '🚨' : '⚠️'} <strong>Action Required:</strong> Please complete this payment and mark it as done in your Personal Super App.
            ${isOverdue ? '<br><br><strong>Note:</strong> You will continue to receive reminders every 2 days until this is marked complete.' : ''}
          </p>
        </div>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        
        <p style="color: #6b7280; font-size: 14px; text-align: center;">
          This is an automated reminder from your Personal Super App.<br>
          You're receiving this because you set up a bill reminder.${isOverdue ? '<br><strong>This bill is overdue - please take action soon!</strong>' : ''}
        </p>
      </div>
    `

    // Send email using Resend API
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: [to],
        subject: subject,
        html: emailContent,
      }),
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Resend API error: ${response.status} - ${errorData}`)
    }

    const result = await response.json()
    console.log('Email sent successfully:', result)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email sent successfully via Resend',
        emailId: result.id
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error sending email:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
