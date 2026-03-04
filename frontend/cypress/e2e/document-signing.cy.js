describe('Document signing flow', () => {
  it('creates joining agreement and signs as employee', () => {
    const backendUrl = Cypress.env('backendUrl') || 'http://localhost:5000';

    const adminEmail = 'admin@propninja.com';
    const adminPassword = 'admin123';

    cy.request('POST', `${backendUrl}/api/auth/login`, {
      email: adminEmail,
      password: adminPassword
    }).then((loginRes) => {
      expect(loginRes.status).to.eq(200);
      expect(loginRes.body && loginRes.body.token).to.be.a('string');

      const token = loginRes.body.token;
      const uniqueEmail = `candidate${Date.now()}@example.com`;

      return cy.request({
        method: 'POST',
        url: `${backendUrl}/api/documents/joining-agreement/send`,
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: {
          fullName: 'Test Candidate',
          fatherName: 'Test Father',
          email: uniqueEmail,
          salutation: 'Mr.',
          address: 'Test Address',
          designation: 'Sales Executive',
          joiningDate: new Date().toISOString(),
          ctc: 100000,
          panNumber: 'ABCDE1234F',
          aadharNumber: '123412341234',
          hrSignature:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOeP3jUAAAAASUVORK5CYII='
        }
      });
    }).then((docRes) => {
      expect(docRes.status).to.eq(200);
      expect(docRes.body && docRes.body.success).to.eq(true);
      expect(docRes.body && docRes.body.data && docRes.body.data.token).to.be.a('string');

      const signingToken = docRes.body.data.token;

      cy.visit(`/sign/${signingToken}`);

      cy.contains('Document Preview').should('be.visible');
      cy.get('input[type="checkbox"]').check({ force: true });
      cy.contains('button', 'Sign Document').click();

      cy.get('canvas')
        .should('be.visible')
        .then(($canvas) => {
          const rect = $canvas[0].getBoundingClientRect();
          const x1 = rect.left + rect.width * 0.3;
          const y1 = rect.top + rect.height * 0.5;
          const x2 = rect.left + rect.width * 0.6;
          const y2 = rect.top + rect.height * 0.55;
          const x3 = rect.left + rect.width * 0.8;
          const y3 = rect.top + rect.height * 0.45;

          cy.wrap($canvas)
            .trigger('pointerdown', { pointerId: 1, pointerType: 'pen', isPrimary: true, buttons: 1, pressure: 0.5, clientX: x1, clientY: y1, force: true })
            .trigger('pointermove', { pointerId: 1, pointerType: 'pen', isPrimary: true, buttons: 1, pressure: 0.5, clientX: x2, clientY: y2, force: true })
            .trigger('pointermove', { pointerId: 1, pointerType: 'pen', isPrimary: true, buttons: 1, pressure: 0.5, clientX: x3, clientY: y3, force: true })
            .trigger('pointerup', { pointerId: 1, pointerType: 'pen', isPrimary: true, buttons: 0, pressure: 0, clientX: x3, clientY: y3, force: true });
        });

      cy.contains('button', 'Sign & Submit').should('not.be.disabled').click();

      cy.contains('Signed Successfully!', { timeout: 60000 }).should('be.visible');

      cy.visit(`/sign/${signingToken}`);
      cy.contains('Document already completed', { timeout: 30000 }).should('be.visible');
    });
  });
});
